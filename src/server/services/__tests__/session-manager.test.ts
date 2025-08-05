import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager, type SessionManagerConfig, type CreateSessionParams } from '../session-manager';
import type { GitService } from '../git';
import type { DockerService } from '../docker';
import type { UserPermissions } from '@/types/domain';

// Mock the services
const mockGitService = {
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  getWorktreePath: vi.fn(),
} as unknown as GitService;

const mockDockerService = {
  createIdeContainer: vi.fn(),
  getContainerInfo: vi.fn(),
  removeContainer: vi.fn(),
  listContainers: vi.fn(),
  healthCheck: vi.fn(),
  cleanupInactiveContainers: vi.fn(),
  getSystemStats: vi.fn(),
  getContainerStats: vi.fn(),
} as unknown as DockerService;

const mockLogger = vi.fn();

const defaultConfig: SessionManagerConfig = {
  extensionsPath: '/test/extensions',
};

const defaultPermissions: UserPermissions = {
  canCreateBranches: true,
  branchLimit: 5,
  allowedBaseBranches: ['main', 'develop'],
  allowTerminalAccess: true,
};

const defaultCreateParams: CreateSessionParams = {
  userId: 1,
  repositoryId: 1,
  branchName: 'feat/test-branch',
  permissions: defaultPermissions,
};

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a new SessionManager instance with mocked dependencies
    sessionManager = new SessionManager(defaultConfig, mockLogger);
    
    // Replace the service instances with mocks
    (sessionManager as any).gitService = mockGitService;
    (sessionManager as any).dockerService = mockDockerService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('should create a new IDE session successfully', async () => {
      // Arrange
      const mockWorktreePath = '/test/worktrees/repo_1/user_1/feat_test-branch';
      const mockContainerInfo = {
        id: 'container123',
        name: 'ide_user_1_repo_1_feat_test-branch',
        status: 'running',
        created: new Date(),
        labels: {},
        ports: [],
        mounts: [],
      };

      vi.mocked(mockGitService.createWorktree).mockResolvedValue({
        success: true,
        message: 'Worktree created successfully',
      });
      
      vi.mocked(mockGitService.getWorktreePath).mockReturnValue(mockWorktreePath);
      
      vi.mocked(mockDockerService.createIdeContainer).mockResolvedValue(mockContainerInfo);
      
      vi.mocked(mockDockerService.getContainerInfo).mockResolvedValue({
        ...mockContainerInfo,
        labels: {},
        ports: [],
        mounts: [],
      });

      vi.mocked(mockDockerService.listContainers).mockResolvedValue([]);

      // Act
      const result = await sessionManager.createSession(defaultCreateParams);

      // Assert
      expect(result).toEqual({
        sessionId: 'container123',
        containerUrl: expect.stringContaining('ide_user_1_repo_1_feat_test-branch'),
        status: 'running',
        createdAt: mockContainerInfo.created,
      });

      expect(mockGitService.createWorktree).toHaveBeenCalledWith(
        1,
        'feat/test-branch',
        1
      );

      expect(mockDockerService.createIdeContainer).toHaveBeenCalledWith({
        userId: 1,
        repositoryId: 1,
        branchName: 'feat/test-branch',
        worktreePath: mockWorktreePath,
        extensionsPath: '/test/extensions',
        terminalAccess: true,
      });
    });

    it('should handle worktree creation failure', async () => {
      // Arrange
      vi.mocked(mockGitService.createWorktree).mockResolvedValue({
        success: false,
        error: 'Git operation failed',
      });

      vi.mocked(mockDockerService.listContainers).mockResolvedValue([]);

      // Act & Assert
      await expect(sessionManager.createSession(defaultCreateParams))
        .rejects.toThrow('Failed to create worktree: Git operation failed');

      expect(mockDockerService.createIdeContainer).not.toHaveBeenCalled();
    });

    it('should reuse existing session if available', async () => {
      // Arrange
      const existingContainer = {
        id: 'existing123',
        name: 'ide_user_1_repo_1_feat_test-branch',
        status: 'running',
        created: new Date(),
        labels: {
          'cloud-ide-orchestrator.user-id': '1',
          'cloud-ide-orchestrator.repository-id': '1',
          'cloud-ide-orchestrator.branch-name': 'feat/test-branch',
        },
        ports: [],
        mounts: [],
      };

      vi.mocked(mockDockerService.listContainers).mockResolvedValue([existingContainer]);
      vi.mocked(mockDockerService.getContainerInfo).mockResolvedValue(existingContainer);
      
      // Mock createWorktree to avoid the error
      vi.mocked(mockGitService.createWorktree).mockResolvedValue({
        success: true,
        message: 'Worktree created successfully',
      });
      
      vi.mocked(mockGitService.getWorktreePath).mockReturnValue('/test/worktrees/repo_1/user_1/feat_test-branch');
      
      // Mock createIdeContainer in case it's called
      vi.mocked(mockDockerService.createIdeContainer).mockResolvedValue({
        id: 'new-container123',
        name: 'ide_user_1_repo_1_feat_test-branch',
        status: 'running',
        created: new Date(),
        labels: {},
        ports: [],
        mounts: [],
      });

      // Act
      const result = await sessionManager.createSession(defaultCreateParams);

      // Assert
      expect(result.sessionId).toBe('existing123');
      expect(mockGitService.createWorktree).not.toHaveBeenCalled();
      expect(mockDockerService.createIdeContainer).not.toHaveBeenCalled();
    });

    it('should enforce concurrent session limits', async () => {
      // Arrange
      const existingSessions = Array.from({ length: 3 }, (_, i) => ({
        id: `container${i}`,
        name: `ide_user_1_repo_${i}_branch`,
        status: 'running',
        created: new Date(),
        labels: {
          'cloud-ide-orchestrator.user-id': '1',
        },
        ports: [],
        mounts: [],
      }));

      vi.mocked(mockDockerService.listContainers).mockResolvedValue(existingSessions);

      // Act & Assert
      await expect(sessionManager.createSession(defaultCreateParams))
        .rejects.toThrow('Maximum concurrent sessions limit reached (3)');
    });
  });

  describe('stopSession', () => {
    it('should stop a session successfully', async () => {
      // Arrange
      const mockContainerInfo = {
        id: 'container123',
        name: 'ide_user_1_repo_1_feat_test-branch',
        status: 'running',
        created: new Date(),
        labels: {
          'cloud-ide-orchestrator.user-id': '1',
          'cloud-ide-orchestrator.repository-id': '1',
          'cloud-ide-orchestrator.branch-name': 'feat/test-branch',
        },
        ports: [],
        mounts: [],
      };

      vi.mocked(mockDockerService.getContainerInfo).mockResolvedValue(mockContainerInfo);
      vi.mocked(mockDockerService.removeContainer).mockResolvedValue();
      vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
        success: true,
        message: 'Worktree removed successfully',
      });

      // Act
      await sessionManager.stopSession('container123');

      // Assert
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('container123');
      expect(mockGitService.removeWorktree).toHaveBeenCalledWith(1, 'feat/test-branch', 1);
    });

    it('should handle container removal failure gracefully', async () => {
      // Arrange
      const mockContainerInfo = {
        id: 'container123',
        name: 'ide_user_1_repo_1_feat_test-branch',
        status: 'running',
        created: new Date(),
        labels: {
          'cloud-ide-orchestrator.user-id': '1',
          'cloud-ide-orchestrator.repository-id': '1',
          'cloud-ide-orchestrator.branch-name': 'feat/test-branch',
        },
        ports: [],
        mounts: [],
      };

      vi.mocked(mockDockerService.getContainerInfo).mockResolvedValue(mockContainerInfo);
      vi.mocked(mockDockerService.removeContainer).mockRejectedValue(new Error('Container removal failed'));

      // Act & Assert
      await expect(sessionManager.stopSession('container123'))
        .rejects.toThrow('Container removal failed');
    });
  });

  describe('getUserSessions', () => {
    it('should return user sessions', async () => {
      // Arrange
      const mockContainers = [
        {
          id: 'container1',
          name: 'ide_user_1_repo_1_branch1',
          status: 'running',
          created: new Date(),
          labels: {
            'cloud-ide-orchestrator.user-id': '1',
          },
          ports: [],
          mounts: [],
        },
        {
          id: 'container2',
          name: 'ide_user_2_repo_1_branch1',
          status: 'running',
          created: new Date(),
          labels: {
            'cloud-ide-orchestrator.user-id': '2',
          },
          ports: [],
          mounts: [],
        },
      ];

      vi.mocked(mockDockerService.listContainers).mockResolvedValue(mockContainers);

      // Act
      const result = await sessionManager.getUserSessions(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.sessionId).toBe('container1');
    });
  });

  describe('performHealthChecks', () => {
    it('should perform health checks on all containers', async () => {
      // Arrange
      const mockContainers = [
        {
          id: 'container1',
          name: 'ide_user_1_repo_1_branch1',
          status: 'running',
          created: new Date(),
          labels: {},
          ports: [],
          mounts: [],
        },
      ];

      const mockHealthCheck = {
        containerId: 'container1',
        healthy: true,
        lastCheck: new Date(),
      };

      const mockStats = {
        cpu: 25.5,
        memory: 1024 * 1024 * 512, // 512MB
        memoryLimit: 1024 * 1024 * 1024 * 2, // 2GB
        networkRx: 1024,
        networkTx: 2048,
      };

      vi.mocked(mockDockerService.listContainers).mockResolvedValue(mockContainers);
      vi.mocked(mockDockerService.healthCheck).mockResolvedValue(mockHealthCheck);
      vi.mocked(mockDockerService.getContainerStats).mockResolvedValue(mockStats);

      // Act
      const result = await sessionManager.performHealthChecks();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sessionId: 'container1',
        healthy: true,
        error: undefined,
        resourceUsage: mockStats,
      });
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('should cleanup inactive sessions', async () => {
      // Arrange
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const mockContainers = [
        {
          id: 'container1',
          name: 'ide_user_1_repo_1_branch1',
          status: 'running',
          created: oldDate,
          labels: {
            'cloud-ide-orchestrator.user-id': '1',
            'cloud-ide-orchestrator.repository-id': '1',
            'cloud-ide-orchestrator.branch-name': 'old-branch',
            'cloud-ide-orchestrator.last-accessed': oldDate.toISOString(),
          },
          ports: [],
          mounts: [],
        },
      ];

      vi.mocked(mockDockerService.listContainers).mockResolvedValue(mockContainers);
      vi.mocked(mockDockerService.getContainerInfo).mockResolvedValue(mockContainers[0]!);
      vi.mocked(mockDockerService.removeContainer).mockResolvedValue();
      vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
        success: true,
        message: 'Worktree removed successfully',
      });

      // Act
      const result = await sessionManager.cleanupInactiveSessions();

      // Assert
      expect(result.cleaned).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('container1');
    });
  });

  describe('getSystemStats', () => {
    it('should return system statistics', async () => {
      // Arrange
      const mockContainers = [
        {
          id: 'container1',
          name: 'ide_user_1_repo_1_branch1',
          status: 'running',
          created: new Date(),
          labels: {
            'cloud-ide-orchestrator.user-id': '1',
          },
          ports: [],
          mounts: [],
        },
        {
          id: 'container2',
          name: 'ide_user_2_repo_1_branch1',
          status: 'running',
          created: new Date(),
          labels: {
            'cloud-ide-orchestrator.user-id': '2',
          },
          ports: [],
          mounts: [],
        },
      ];

      const mockSystemStats = {
        containerCount: 2,
        totalCpuUsage: 45.2,
        totalMemoryUsage: 1024 * 1024 * 1024, // 1GB
      };

      vi.mocked(mockDockerService.listContainers).mockResolvedValue(mockContainers);
      vi.mocked(mockDockerService.getSystemStats).mockResolvedValue(mockSystemStats);

      // Act
      const result = await sessionManager.getSystemStats();

      // Assert
      expect(result).toEqual({
        totalSessions: 2,
        activeSessions: 2,
        systemResources: mockSystemStats,
        sessionsByUser: {
          1: 1,
          2: 1,
        },
      });
    });
  });
});