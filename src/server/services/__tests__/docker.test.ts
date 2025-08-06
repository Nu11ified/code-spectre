import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { DockerService, createDefaultDockerConfig, type DockerServiceConfig } from '../docker';
import type { ContainerInfo, ContainerStats } from '../docker';
import type { UserPermissions } from '@/types/domain';

// Mock dockerode
const mockDocker = {
  ping: vi.fn(),
  listNetworks: vi.fn(),
  createNetwork: vi.fn(),
  createContainer: vi.fn(),
  listContainers: vi.fn(),
  getContainer: vi.fn(),
};

const mockContainer = {
  start: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn(),
  inspect: vi.fn(),
  stats: vi.fn(),
};

vi.mock('dockerode', () => {
  return {
    default: vi.fn(() => mockDocker),
  };
});

describe('DockerService', () => {
  let dockerService: DockerService;
  let config: DockerServiceConfig;
  let mockLogger: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    config = {
      socketPath: '/var/run/docker.sock',
      defaultImage: 'codercom/code-server:latest',
      networkName: 'test-network',
      baseUrl: 'test.localhost',
      sessionTimeoutMinutes: 60,
      maxContainers: 10,
      defaultResources: {
        memory: '2g',
        cpus: '1.0',
      },
    };

    mockLogger = vi.fn();
    dockerService = new DockerService(config, mockLogger);
  });

  afterEach(async () => {
    await dockerService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([{ Name: 'test-network' }]);

      await dockerService.initialize();

      expect(mockDocker.ping).toHaveBeenCalled();
      expect(mockDocker.listNetworks).toHaveBeenCalledWith({
        filters: { name: ['test-network'] },
      });
      expect(mockLogger).toHaveBeenCalledWith('info', 'Docker service initialized', expect.any(Object));
    });

    it('should create network if it does not exist', async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([]);
      mockDocker.createNetwork.mockResolvedValue({ id: 'network-id' });

      await dockerService.initialize();

      // Should create both main network and isolated network
      expect(mockDocker.createNetwork).toHaveBeenCalledWith({
        Name: 'test-network',
        Driver: 'bridge',
        Labels: {
          'cloud-ide-orchestrator.managed': 'true',
        },
      });
      
      expect(mockDocker.createNetwork).toHaveBeenCalledWith({
        Name: 'cloud-ide-isolated',
        Driver: 'bridge',
        Internal: true,
        Labels: {
          'cloud-ide-orchestrator.managed': 'true',
          'cloud-ide-orchestrator.type': 'isolated',
        },
        IPAM: {
          Driver: 'default',
          Config: [{
            Subnet: '172.20.0.0/16',
            Gateway: '172.20.0.1',
          }],
        },
        Options: {
          'com.docker.network.bridge.enable_icc': 'false',
          'com.docker.network.bridge.enable_ip_masquerade': 'false',
          'com.docker.network.driver.mtu': '1500',
        },
      });
    });

    it('should throw error if Docker is not available', async () => {
      mockDocker.ping.mockRejectedValue(new Error('Docker not available'));

      await expect(dockerService.initialize()).rejects.toThrow('Docker service initialization failed');
      expect(mockLogger).toHaveBeenCalledWith('error', 'Failed to initialize Docker service', expect.any(Object));
    });
  });

  describe('container creation', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([{ Name: 'test-network' }]);
      mockDocker.listContainers.mockResolvedValue([]);
      await dockerService.initialize();
    });

    it('should create and start a new IDE container', async () => {
      const mockContainerId = 'container-123';
      const mockContainerData = {
        Id: mockContainerId,
        Name: '/ide_user_1_repo_1_main',
        Created: '2024-01-01T00:00:00Z',
        State: { Status: 'running', Running: true },
        Config: { Labels: {} },
        NetworkSettings: { Ports: {} },
        Mounts: [],
      };

      mockDocker.createContainer.mockResolvedValue({ 
        id: mockContainerId,
        start: mockContainer.start,
      });
      mockContainer.start.mockResolvedValue(undefined);
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue(mockContainerData),
      });

      const result = await dockerService.createIdeContainer({
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/srv/worktrees/repo_1/user_1/main',
        extensionsPath: '/srv/extensions',
        permissions: {
          canCreateBranches: true,
          branchLimit: 5,
          allowedBaseBranches: ['main', 'develop'],
          allowTerminalAccess: true,
        },
      });

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'codercom/code-server:latest',
          name: 'ide_user_1_repo_1_main',
          Labels: expect.objectContaining({
            'cloud-ide-orchestrator.managed': 'true',
            'cloud-ide-orchestrator.user-id': '1',
            'cloud-ide-orchestrator.repository-id': '1',
            'cloud-ide-orchestrator.branch-name': 'main',
          }),
        })
      );
      expect(mockContainer.start).toHaveBeenCalled();
      expect(result.id).toBe(mockContainerId);
      expect(result.name).toBe('ide_user_1_repo_1_main');
    });

    it('should return existing container if it already exists', async () => {
      const existingContainer = {
        Id: 'existing-123',
        Names: ['/ide_user_1_repo_1_main'],
        State: 'running',
        Created: Date.now() / 1000,
        Labels: { 'cloud-ide-orchestrator.managed': 'true' },
        Ports: [],
        Mounts: [],
      };

      mockDocker.listContainers.mockResolvedValue([existingContainer]);

      const result = await dockerService.createIdeContainer({
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/srv/worktrees/repo_1/user_1/main',
        extensionsPath: '/srv/extensions',
        permissions: {
          canCreateBranches: true,
          branchLimit: 5,
          allowedBaseBranches: ['main', 'develop'],
          allowTerminalAccess: true,
        },
      });

      expect(mockDocker.createContainer).not.toHaveBeenCalled();
      expect(result.name).toBe('ide_user_1_repo_1_main');
    });

    it('should enforce container limits', async () => {
      // Mock max containers reached
      const runningContainers = Array.from({ length: 10 }, (_, i) => ({
        Id: `container-${i}`,
        Names: [`/container-${i}`],
        State: 'running',
        Created: Date.now() / 1000,
        Labels: { 'cloud-ide-orchestrator.managed': 'true' },
        Ports: [],
        Mounts: [],
      }));

      mockDocker.listContainers.mockResolvedValue(runningContainers);

      await expect(dockerService.createIdeContainer({
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/srv/worktrees/repo_1/user_1/main',
        extensionsPath: '/srv/extensions',
        permissions: {
          canCreateBranches: true,
          branchLimit: 5,
          allowedBaseBranches: ['main', 'develop'],
          allowTerminalAccess: true,
        },
      })).rejects.toThrow('Maximum container limit reached');
    });

    it('should disable terminal access when not allowed', async () => {
      const mockContainerId = 'container-123';
      mockDocker.createContainer.mockResolvedValue({ 
        id: mockContainerId,
        start: mockContainer.start,
      });
      mockContainer.start.mockResolvedValue(undefined);
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          Id: mockContainerId,
          Name: '/ide_user_1_repo_1_main',
          Created: '2024-01-01T00:00:00Z',
          State: { Status: 'running', Running: true },
          Config: { Labels: {} },
          NetworkSettings: { Ports: {} },
          Mounts: [],
        }),
      });

      await dockerService.createIdeContainer({
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/srv/worktrees/repo_1/user_1/main',
        extensionsPath: '/srv/extensions',
        permissions: {
          canCreateBranches: true,
          branchLimit: 5,
          allowedBaseBranches: ['main', 'develop'],
          allowTerminalAccess: false,
        },
      });

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Env: expect.arrayContaining(['DISABLE_TERMINAL=true']),
        })
      );
    });
  });

  describe('container lifecycle management', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([{ Name: 'test-network' }]);
      await dockerService.initialize();
    });

    it('should stop a running container', async () => {
      const containerId = 'container-123';
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
        }),
        stop: mockContainer.stop,
      });
      mockContainer.stop.mockResolvedValue(undefined);

      await dockerService.stopContainer(containerId);

      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(mockLogger).toHaveBeenCalledWith('info', 'Container stopped', { containerId });
    });

    it('should skip stopping if container is already stopped', async () => {
      const containerId = 'container-123';
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          State: { Running: false },
        }),
        stop: mockContainer.stop,
      });

      await dockerService.stopContainer(containerId);

      expect(mockContainer.stop).not.toHaveBeenCalled();
      expect(mockLogger).toHaveBeenCalledWith('info', 'Container already stopped', { containerId });
    });

    it('should remove a container', async () => {
      const containerId = 'container-123';
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          State: { Running: false },
        }),
        remove: mockContainer.remove,
      });
      mockContainer.remove.mockResolvedValue(undefined);

      await dockerService.removeContainer(containerId);

      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(mockLogger).toHaveBeenCalledWith('info', 'Container removed', { containerId });
    });
  });

  describe('container monitoring', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([{ Name: 'test-network' }]);
      await dockerService.initialize();
    });

    it('should get container information', async () => {
      const containerId = 'container-123';
      const mockContainerData = {
        Id: containerId,
        Name: '/test-container',
        Created: '2024-01-01T00:00:00Z',
        State: { Status: 'running' },
        Config: { Labels: { 'test': 'label' } },
        NetworkSettings: { 
          Ports: { 
            '8080/tcp': [{ HostPort: '8080' }] 
          } 
        },
        Mounts: [{
          Source: '/host/path',
          Destination: '/container/path',
          Mode: 'rw',
          RW: true,
        }],
      };

      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue(mockContainerData),
      });

      const result = await dockerService.getContainerInfo(containerId);

      expect(result).toEqual({
        id: containerId,
        name: 'test-container',
        status: 'running',
        created: new Date('2024-01-01T00:00:00Z'),
        labels: { 'test': 'label' },
        ports: [{
          privatePort: 8080,
          publicPort: 8080,
          type: 'tcp',
        }],
        mounts: [{
          source: '/host/path',
          destination: '/container/path',
          mode: 'rw',
          rw: true,
        }],
      });
    });

    it('should get container statistics', async () => {
      const containerId = 'container-123';
      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000 },
          system_cpu_usage: 10000000,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 5000000,
        },
        memory_stats: {
          usage: 1073741824, // 1GB
          limit: 2147483648, // 2GB
        },
        networks: {
          eth0: {
            rx_bytes: 1024,
            tx_bytes: 2048,
          },
        },
      };

      mockDocker.getContainer.mockReturnValue({
        stats: vi.fn().mockResolvedValue(mockStats),
      });

      const result = await dockerService.getContainerStats(containerId);

      expect(result).toEqual({
        cpu: 20, // (2000000 - 1000000) / (10000000 - 5000000) * 100
        memory: 1073741824,
        memoryLimit: 2147483648,
        networkRx: 1024,
        networkTx: 2048,
      });
    });

    it('should perform health check on container', async () => {
      const containerId = 'container-123';
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          State: { 
            Running: true,
            Health: { Status: 'healthy' },
          },
        }),
      });

      const result = await dockerService.healthCheck(containerId);

      expect(result.containerId).toBe(containerId);
      expect(result.healthy).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect unhealthy container', async () => {
      const containerId = 'container-123';
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          State: { 
            Running: true,
            Health: { 
              Status: 'unhealthy',
              FailingStreak: 3,
            },
          },
        }),
      });

      const result = await dockerService.healthCheck(containerId);

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('3');
    });
  });

  describe('container cleanup', () => {
    beforeEach(async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([{ Name: 'test-network' }]);
      await dockerService.initialize();
    });

    it('should clean up inactive containers', async () => {
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const recentTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      const containers = [
        {
          Id: 'old-container',
          Names: ['/old-container'],
          State: 'running',
          Created: oldTime.getTime() / 1000,
          Labels: { 
            'cloud-ide-orchestrator.managed': 'true',
            'cloud-ide-orchestrator.created': oldTime.toISOString(),
          },
          Ports: [],
          Mounts: [],
        },
        {
          Id: 'recent-container',
          Names: ['/recent-container'],
          State: 'running',
          Created: recentTime.getTime() / 1000,
          Labels: { 
            'cloud-ide-orchestrator.managed': 'true',
            'cloud-ide-orchestrator.created': recentTime.toISOString(),
          },
          Ports: [],
          Mounts: [],
        },
      ];

      mockDocker.listContainers.mockResolvedValue(containers);
      mockDocker.getContainer.mockImplementation((id: string) => ({
        inspect: vi.fn().mockResolvedValue({ State: { Running: false } }),
        remove: vi.fn().mockResolvedValue(undefined),
      }));

      await dockerService.cleanupInactiveContainers();

      expect(mockDocker.getContainer).toHaveBeenCalledWith('old-container');
      expect(mockLogger).toHaveBeenCalledWith('info', 'Cleaning up inactive container', expect.objectContaining({
        containerId: 'old-container',
      }));
    });

    it('should get system statistics', async () => {
      const containers = [
        {
          Id: 'container-1',
          Names: ['/container-1'],
          State: 'running',
          Created: Date.now() / 1000,
          Labels: { 'cloud-ide-orchestrator.managed': 'true' },
          Ports: [],
          Mounts: [],
        },
        {
          Id: 'container-2',
          Names: ['/container-2'],
          State: 'exited',
          Created: Date.now() / 1000,
          Labels: { 'cloud-ide-orchestrator.managed': 'true' },
          Ports: [],
          Mounts: [],
        },
      ];

      mockDocker.listContainers.mockResolvedValue(containers);
      mockDocker.getContainer.mockImplementation((id: string) => ({
        stats: vi.fn().mockResolvedValue({
          cpu_stats: { cpu_usage: { total_usage: 2000000 }, system_cpu_usage: 10000000 },
          precpu_stats: { cpu_usage: { total_usage: 1000000 }, system_cpu_usage: 5000000 },
          memory_stats: { usage: 1073741824, limit: 2147483648 },
          networks: { eth0: { rx_bytes: 1024, tx_bytes: 2048 } },
        }),
      }));

      const result = await dockerService.getSystemStats();

      expect(result.containerCount).toBe(2);
      expect(result.totalCpuUsage).toBe(20);
      expect(result.totalMemoryUsage).toBe(1073741824);
    });
  });

  describe('configuration', () => {
    it('should create default configuration', () => {
      const config = createDefaultDockerConfig();

      expect(config).toEqual({
        socketPath: '/var/run/docker.sock',
        defaultImage: 'codercom/code-server:latest',
        networkName: 'cloud-ide-network',
        baseUrl: 'localhost',
        sessionTimeoutMinutes: 60,
        maxContainers: 50,
        defaultResources: {
          memory: '2g',
          cpus: '1.0',
        },
      });
    });

    it('should parse memory limits correctly', () => {
      const service = new DockerService(config);
      
      // Test private method through container creation
      const mockSecurityProfile = {
        userId: 1,
        permissions: {
          canCreateBranches: true,
          branchLimit: 5,
          allowedBaseBranches: ['main', 'develop'],
          allowTerminalAccess: true,
        },
        networkRestrictions: {
          allowedHosts: ['127.0.0.1'],
          blockedPorts: [22, 23],
          enableInternet: false,
        },
        fileSystemRestrictions: {
          allowedPaths: ['/home/coder/workspace'],
          readOnlyPaths: ['/etc', '/usr'],
          maxFileSize: 100 * 1024 * 1024,
        },
        resourceLimits: {
          memory: '2g',
          cpu: '1.0',
          diskQuota: '5g',
        },
        terminalRestrictions: {
          enabled: true,
          allowedCommands: ['ls', 'cd'],
          blockedCommands: ['rm -rf'],
          timeout: 3600,
        },
      };

      const containerConfig = (service as any).buildSecureContainerConfig({
        name: 'test',
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/test',
        extensionsPath: '/test',
        securityProfile: mockSecurityProfile,
      });

      expect(containerConfig.HostConfig.Memory).toBe(2 * 1024 * 1024 * 1024); // 2GB in bytes
    });

    it('should parse CPU limits correctly', () => {
      const service = new DockerService(config);
      
      const mockSecurityProfile = {
        userId: 1,
        permissions: {
          canCreateBranches: true,
          branchLimit: 5,
          allowedBaseBranches: ['main', 'develop'],
          allowTerminalAccess: true,
        },
        networkRestrictions: {
          allowedHosts: ['127.0.0.1'],
          blockedPorts: [22, 23],
          enableInternet: false,
        },
        fileSystemRestrictions: {
          allowedPaths: ['/home/coder/workspace'],
          readOnlyPaths: ['/etc', '/usr'],
          maxFileSize: 100 * 1024 * 1024,
        },
        resourceLimits: {
          memory: '2g',
          cpu: '1.0',
          diskQuota: '5g',
        },
        terminalRestrictions: {
          enabled: true,
          allowedCommands: ['ls', 'cd'],
          blockedCommands: ['rm -rf'],
          timeout: 3600,
        },
      };

      const containerConfig = (service as any).buildSecureContainerConfig({
        name: 'test',
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/test',
        extensionsPath: '/test',
        securityProfile: mockSecurityProfile,
      });

      expect(containerConfig.HostConfig.CpuQuota).toBe(100000); // 1.0 CPU = 100000 microseconds
      expect(containerConfig.HostConfig.CpuPeriod).toBe(100000);
    });
  });

  describe('error handling', () => {
    it('should handle container creation errors', async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([{ Name: 'test-network' }]);
      mockDocker.listContainers.mockResolvedValue([]);
      await dockerService.initialize();

      mockDocker.createContainer.mockRejectedValue(new Error('Container creation failed'));

      await expect(dockerService.createIdeContainer({
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/srv/worktrees/repo_1/user_1/main',
        extensionsPath: '/srv/extensions',
        permissions: {
          canCreateBranches: true,
          branchLimit: 5,
          allowedBaseBranches: ['main', 'develop'],
          allowTerminalAccess: true,
        },
      })).rejects.toThrow('Container creation failed');

      expect(mockLogger).toHaveBeenCalledWith('error', 'Failed to create IDE container', expect.any(Object));
    });

    it('should handle container stop errors', async () => {
      mockDocker.ping.mockResolvedValue(true);
      mockDocker.listNetworks.mockResolvedValue([{ Name: 'test-network' }]);
      await dockerService.initialize();

      const containerId = 'container-123';
      mockDocker.getContainer.mockReturnValue({
        inspect: vi.fn().mockRejectedValue(new Error('Container not found')),
        stop: mockContainer.stop,
      });

      await expect(dockerService.stopContainer(containerId)).rejects.toThrow('Container stop failed');
      expect(mockLogger).toHaveBeenCalledWith('error', 'Failed to stop container', expect.any(Object));
    });
  });
});