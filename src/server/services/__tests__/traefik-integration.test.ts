import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { DockerService, createDefaultDockerConfig } from '../docker';
import { TraefikService, createDefaultTraefikConfig } from '../traefik';

// Integration tests for Traefik + Docker service
// These tests require Docker to be available and will create real containers
// Run with: npm test -- --run traefik-integration.test.ts

const SKIP_INTEGRATION_TESTS = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_INTEGRATION_TESTS)('Traefik Integration Tests', () => {
  let dockerService: DockerService;
  let traefikService: TraefikService;
  let testContainers: string[] = [];

  beforeAll(async () => {
    // Initialize services with test configuration
    const dockerConfig = {
      ...createDefaultDockerConfig(),
      networkName: 'test-cloud-ide-network',
      baseUrl: 'test.local',
      maxContainers: 5,
      sessionTimeoutMinutes: 1, // Short timeout for testing
    };

    const traefikConfig = {
      ...createDefaultTraefikConfig(),
      domain: 'test.local',
      networkName: 'test-cloud-ide-network',
      enableTLS: false,
      enableDashboard: true,
    };

    dockerService = new DockerService(dockerConfig);
    traefikService = new TraefikService(traefikConfig);

    // Initialize services
    await dockerService.initialize();
    await traefikService.initialize();
  }, 60000); // 60 second timeout for initialization

  afterAll(async () => {
    // Cleanup all test containers
    for (const containerId of testContainers) {
      try {
        await dockerService.removeContainer(containerId);
      } catch (error) {
        console.warn(`Failed to cleanup container ${containerId}:`, error);
      }
    }

    // Shutdown services
    await dockerService.shutdown();

    // Remove test network
    try {
      const { execSync } = await import('child_process');
      execSync('docker network rm test-cloud-ide-network', { encoding: 'utf-8' });
    } catch {
      // Network might not exist or have containers
    }
  }, 30000);

  beforeEach(() => {
    testContainers = [];
  });

  afterEach(async () => {
    // Cleanup containers created in this test
    for (const containerId of testContainers) {
      try {
        await dockerService.removeContainer(containerId);
      } catch {
        // Container might already be removed
      }
    }
    testContainers = [];
  });

  describe('Container Creation with Traefik Routing', () => {
    it('should create container and register Traefik route', async () => {
      const containerInfo = await dockerService.createIdeContainer({
        userId: 1,
        repositoryId: 1,
        branchName: 'main',
        worktreePath: '/tmp/test-worktree',
        extensionsPath: '/tmp/test-extensions',
        terminalAccess: true,
      });

      testContainers.push(containerInfo.id);

      // Verify container was created
      expect(containerInfo.id).toBeDefined();
      expect(containerInfo.name).toMatch(/ide_user_1_repo_1_main/);
      expect(containerInfo.status).toBe('running');

      // Verify Traefik route was registered
      expect(containerInfo.route).toBeDefined();
      expect(containerInfo.route?.url).toMatch(/^http:\/\/ide-u1-r1-main\.test\.local$/);
      expect(containerInfo.route?.userId).toBe(1);
      expect(containerInfo.route?.repositoryId).toBe(1);
      expect(containerInfo.route?.branchName).toBe('main');

      // Verify route is in Traefik's registered routes
      const registeredRoutes = await traefikService.getRegisteredRoutes();
      const matchingRoute = registeredRoutes.find(r => r.containerId === containerInfo.id);
      expect(matchingRoute).toBeDefined();
      expect(matchingRoute?.url).toBe(containerInfo.route?.url);
    }, 30000);

    it('should handle complex branch names in routing', async () => {
      const containerInfo = await dockerService.createIdeContainer({
        userId: 2,
        repositoryId: 3,
        branchName: 'feature/complex-branch_name@123',
        worktreePath: '/tmp/test-worktree-2',
        extensionsPath: '/tmp/test-extensions',
        terminalAccess: false,
      });

      testContainers.push(containerInfo.id);

      expect(containerInfo.route?.subdomain).toBe('ide-u2-r3-feature-complex-branch-name-123');
      expect(containerInfo.route?.url).toBe('http://ide-u2-r3-feature-complex-branch-name-123.test.local');
    }, 30000);

    it('should return existing container if already exists', async () => {
      // Create first container
      const containerInfo1 = await dockerService.createIdeContainer({
        userId: 3,
        repositoryId: 4,
        branchName: 'develop',
        worktreePath: '/tmp/test-worktree-3',
        extensionsPath: '/tmp/test-extensions',
        terminalAccess: true,
      });

      testContainers.push(containerInfo1.id);

      // Try to create same container again
      const containerInfo2 = await dockerService.createIdeContainer({
        userId: 3,
        repositoryId: 4,
        branchName: 'develop',
        worktreePath: '/tmp/test-worktree-3',
        extensionsPath: '/tmp/test-extensions',
        terminalAccess: true,
      });

      // Should return the same container
      expect(containerInfo2.id).toBe(containerInfo1.id);
      expect(containerInfo2.route?.url).toBe(containerInfo1.route?.url);
    }, 30000);
  });

  describe('Container Removal with Route Cleanup', () => {
    it('should remove container and unregister Traefik route', async () => {
      // Create container
      const containerInfo = await dockerService.createIdeContainer({
        userId: 4,
        repositoryId: 5,
        branchName: 'test-removal',
        worktreePath: '/tmp/test-worktree-4',
        extensionsPath: '/tmp/test-extensions',
        terminalAccess: true,
      });

      const containerId = containerInfo.id;

      // Verify route is registered
      let registeredRoutes = await traefikService.getRegisteredRoutes();
      let matchingRoute = registeredRoutes.find(r => r.containerId === containerId);
      expect(matchingRoute).toBeDefined();

      // Remove container
      await dockerService.removeContainer(containerId);

      // Verify route is unregistered
      registeredRoutes = await traefikService.getRegisteredRoutes();
      matchingRoute = registeredRoutes.find(r => r.containerId === containerId);
      expect(matchingRoute).toBeUndefined();

      // Remove from test cleanup list since it's already removed
      testContainers = testContainers.filter(id => id !== containerId);
    }, 30000);
  });

  describe('Route Testing', () => {
    it('should test route connectivity', async () => {
      const containerInfo = await dockerService.createIdeContainer({
        userId: 5,
        repositoryId: 6,
        branchName: 'route-test',
        worktreePath: '/tmp/test-worktree-5',
        extensionsPath: '/tmp/test-extensions',
        terminalAccess: true,
      });

      testContainers.push(containerInfo.id);

      // Wait a moment for container to be fully ready
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Test route (this might fail in CI/test environment without proper DNS)
      // but should not throw an error
      const routeUrl = containerInfo.route?.url;
      expect(routeUrl).toBeDefined();

      if (routeUrl) {
        const isAccessible = await traefikService.testRoute(routeUrl);
        // In test environment, this might be false due to DNS/networking
        // but the method should complete without throwing
        expect(typeof isAccessible).toBe('boolean');
      }
    }, 45000);
  });

  describe('Service Status', () => {
    it('should get Traefik service status', async () => {
      const status = await traefikService.getServiceStatus();

      expect(status.running).toBe(true);
      expect(status.containerId).toBeDefined();
      expect(status.version).toBeDefined();
    });

    it('should get dashboard URL', () => {
      const dashboardUrl = traefikService.getDashboardUrl();
      expect(dashboardUrl).toBe('http://traefik.test.local');
    });
  });

  describe('Multiple Container Management', () => {
    it('should handle multiple containers with different routes', async () => {
      const containers = await Promise.all([
        dockerService.createIdeContainer({
          userId: 6,
          repositoryId: 7,
          branchName: 'multi-1',
          worktreePath: '/tmp/test-worktree-6',
          extensionsPath: '/tmp/test-extensions',
          terminalAccess: true,
        }),
        dockerService.createIdeContainer({
          userId: 7,
          repositoryId: 8,
          branchName: 'multi-2',
          worktreePath: '/tmp/test-worktree-7',
          extensionsPath: '/tmp/test-extensions',
          terminalAccess: false,
        }),
        dockerService.createIdeContainer({
          userId: 8,
          repositoryId: 9,
          branchName: 'multi-3',
          worktreePath: '/tmp/test-worktree-8',
          extensionsPath: '/tmp/test-extensions',
          terminalAccess: true,
        }),
      ]);

      // Add to cleanup list
      testContainers.push(...containers.map(c => c.id));

      // Verify all containers have unique routes
      const routes = containers.map(c => c.route?.url).filter(Boolean);
      const uniqueRoutes = new Set(routes);
      expect(uniqueRoutes.size).toBe(containers.length);

      // Verify all routes are registered
      const registeredRoutes = await traefikService.getRegisteredRoutes();
      for (const container of containers) {
        const matchingRoute = registeredRoutes.find(r => r.containerId === container.id);
        expect(matchingRoute).toBeDefined();
      }
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle container creation failures gracefully', async () => {
      // Try to create container with invalid image
      const dockerConfigWithBadImage = {
        ...createDefaultDockerConfig(),
        defaultImage: 'nonexistent/image:latest',
        networkName: 'test-cloud-ide-network',
      };

      const badDockerService = new DockerService(dockerConfigWithBadImage);

      await expect(
        badDockerService.createIdeContainer({
          userId: 999,
          repositoryId: 999,
          branchName: 'error-test',
          worktreePath: '/tmp/test-worktree-error',
          extensionsPath: '/tmp/test-extensions',
          terminalAccess: true,
        })
      ).rejects.toThrow();

      // Verify no orphaned routes were created
      const registeredRoutes = await traefikService.getRegisteredRoutes();
      const errorRoute = registeredRoutes.find(r => r.branchName === 'error-test');
      expect(errorRoute).toBeUndefined();
    }, 30000);
  });
});