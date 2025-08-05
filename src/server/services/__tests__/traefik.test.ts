import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TraefikService, createDefaultTraefikConfig, type TraefikConfig } from '../traefik';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock path
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
}));

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

const mockExecSync = vi.mocked(execSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);

describe('TraefikService', () => {
  let traefikService: TraefikService;
  let mockLogger: ReturnType<typeof vi.fn>;
  let config: TraefikConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockLogger = vi.fn();
    config = {
      domain: 'test.local',
      networkName: 'test-network',
      enableTLS: false,
      acmeEmail: 'test@example.com',
      enableDashboard: true,
      logLevel: 'INFO',
    };

    traefikService = new TraefikService(config, mockLogger);

    // Default mocks
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('# test config');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create TraefikService with provided config', () => {
      expect(traefikService).toBeInstanceOf(TraefikService);
    });

    it('should use default logger if none provided', () => {
      const service = new TraefikService(config);
      expect(service).toBeInstanceOf(TraefikService);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      // Mock successful network check
      mockExecSync.mockImplementation((command) => {
        if (typeof command === 'string' && command.includes('network ls')) {
          return 'test-network\n';
        }
        if (typeof command === 'string' && command.includes('docker ps')) {
          return 'container_id|cloud-ide-traefik|Up 5 minutes|traefik:v3.0\n';
        }
        return '';
      });
    });

    it('should initialize successfully', async () => {
      await expect(traefikService.initialize()).resolves.not.toThrow();
      
      expect(mockLogger).toHaveBeenCalledWith(
        'info',
        'Traefik service initialized',
        expect.objectContaining({
          domain: 'test.local',
          networkName: 'test-network',
          enableTLS: false,
        })
      );
    });

    it('should create network if it does not exist', async () => {
      mockExecSync.mockImplementation((command) => {
        if (typeof command === 'string' && command.includes('network ls')) {
          return ''; // Network doesn't exist
        }
        if (typeof command === 'string' && command.includes('network create')) {
          return 'network_id\n';
        }
        if (typeof command === 'string' && command.includes('docker ps')) {
          return 'container_id|cloud-ide-traefik|Up 5 minutes|traefik:v3.0\n';
        }
        return '';
      });

      await traefikService.initialize();

      expect(mockExecSync).toHaveBeenCalledWith(
        'docker network create test-network',
        { encoding: 'utf-8' }
      );
    });

    it('should handle initialization errors', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Docker not available');
      });

      await expect(traefikService.initialize()).rejects.toThrow(
        'Traefik service initialization failed'
      );
    });
  });

  describe('registerContainerRoute', () => {
    const containerParams = {
      containerId: 'container123',
      containerName: 'test-container',
      userId: 1,
      repositoryId: 2,
      branchName: 'feature/test',
    };

    beforeEach(() => {
      mockExecSync.mockReturnValue('');
    });

    it('should register container route successfully', async () => {
      const route = await traefikService.registerContainerRoute(containerParams);

      expect(route).toEqual({
        containerId: 'container123',
        containerName: 'test-container',
        userId: 1,
        repositoryId: 2,
        branchName: 'feature/test',
        subdomain: 'ide-u1-r2-feature-test',
        url: 'http://ide-u1-r2-feature-test.test.local',
      });

      expect(mockLogger).toHaveBeenCalledWith(
        'info',
        'Container route registered',
        expect.objectContaining({
          containerId: 'container123',
          subdomain: 'ide-u1-r2-feature-test',
        })
      );
    });

    it('should generate HTTPS URL when TLS is enabled', async () => {
      const tlsConfig = { ...config, enableTLS: true };
      const tlsService = new TraefikService(tlsConfig, mockLogger);

      const route = await tlsService.registerContainerRoute(containerParams);

      expect(route.url).toBe('https://ide-u1-r2-feature-test.test.local');
    });

    it('should sanitize branch names for subdomain', async () => {
      const params = {
        ...containerParams,
        branchName: 'feature/complex-branch_name@123',
      };

      const route = await traefikService.registerContainerRoute(params);

      expect(route.subdomain).toBe('ide-u1-r2-feature-complex-branch-name-123');
    });

    it('should handle registration errors', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Docker update failed');
      });

      await expect(
        traefikService.registerContainerRoute(containerParams)
      ).rejects.toThrow('Route registration failed');
    });
  });

  describe('unregisterContainerRoute', () => {
    beforeEach(() => {
      // Mock container inspection
      mockExecSync.mockImplementation((command) => {
        if (typeof command === 'string' && command.includes('docker inspect')) {
          return 'traefik.enable=true\ntraefik.http.routers.test.rule=Host(`test.local`)\n';
        }
        return '';
      });
    });

    it('should unregister container route successfully', async () => {
      await expect(
        traefikService.unregisterContainerRoute('container123')
      ).resolves.not.toThrow();

      expect(mockLogger).toHaveBeenCalledWith(
        'info',
        'Container route unregistered',
        { containerId: 'container123' }
      );
    });

    it('should handle unregistration errors gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Container not found');
      });

      await expect(
        traefikService.unregisterContainerRoute('container123')
      ).rejects.toThrow('Route unregistration failed');
    });
  });

  describe('getRegisteredRoutes', () => {
    it('should return registered routes', async () => {
      mockExecSync.mockReturnValue(
        'container123|test-container|1|2|feature/test\ncontainer456|another-container|3|4|main\n'
      );

      const routes = await traefikService.getRegisteredRoutes();

      expect(routes).toHaveLength(2);
      expect(routes[0]).toEqual({
        containerId: 'container123',
        containerName: 'test-container',
        userId: 1,
        repositoryId: 2,
        branchName: 'feature/test',
        subdomain: 'ide-u1-r2-feature-test',
        url: 'http://ide-u1-r2-feature-test.test.local',
      });
    });

    it('should return empty array when no containers found', async () => {
      mockExecSync.mockReturnValue('');

      const routes = await traefikService.getRegisteredRoutes();

      expect(routes).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Docker command failed');
      });

      const routes = await traefikService.getRegisteredRoutes();

      expect(routes).toEqual([]);
      expect(mockLogger).toHaveBeenCalledWith(
        'error',
        'Failed to get registered routes',
        expect.any(Object)
      );
    });
  });

  describe('testRoute', () => {
    beforeEach(() => {
      // Mock fetch globally
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return true for successful route test', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValue({
        ok: true,
      } as Response);

      const result = await traefikService.testRoute('http://test.local');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://test.local', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
      });
    });

    it('should return false for failed route test', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      const result = await traefikService.testRoute('http://test.local');

      expect(result).toBe(false);
    });
  });

  describe('getDashboardUrl', () => {
    it('should return dashboard URL when enabled', () => {
      const url = traefikService.getDashboardUrl();
      expect(url).toBe('http://traefik.test.local');
    });

    it('should return null when dashboard is disabled', () => {
      const configWithoutDashboard = { ...config, enableDashboard: false };
      const service = new TraefikService(configWithoutDashboard);

      const url = service.getDashboardUrl();
      expect(url).toBeNull();
    });

    it('should return HTTPS URL when TLS is enabled', () => {
      const tlsConfig = { ...config, enableTLS: true };
      const service = new TraefikService(tlsConfig);

      const url = service.getDashboardUrl();
      expect(url).toBe('https://traefik.test.local');
    });
  });

  describe('getServiceStatus', () => {
    it('should return running status', async () => {
      mockExecSync.mockReturnValue('container123|Up 5 minutes|traefik:v3.0');

      const status = await traefikService.getServiceStatus();

      expect(status).toEqual({
        running: true,
        containerId: 'container123',
        uptime: 'Up 5 minutes',
        version: 'v3.0',
      });
    });

    it('should return not running status', async () => {
      mockExecSync.mockReturnValue('');

      const status = await traefikService.getServiceStatus();

      expect(status).toEqual({
        running: false,
      });
    });

    it('should handle errors gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Docker command failed');
      });

      const status = await traefikService.getServiceStatus();

      expect(status).toEqual({
        running: false,
      });
    });
  });

  describe('createDefaultTraefikConfig', () => {
    it('should create default configuration', () => {
      const defaultConfig = createDefaultTraefikConfig();

      expect(defaultConfig).toEqual({
        domain: 'localhost',
        networkName: 'cloud-ide-network',
        enableTLS: false,
        acmeEmail: 'admin@example.com',
        enableDashboard: false, // Default from environment parsing
        dashboardAuth: undefined,
        logLevel: 'INFO',
      });
    });
  });
});