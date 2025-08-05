import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface TraefikConfig {
  domain: string; // Base domain for IDE sessions
  networkName: string; // Docker network name
  enableTLS: boolean; // Enable TLS/SSL
  acmeEmail: string; // Email for Let's Encrypt
  enableDashboard: boolean; // Enable Traefik dashboard
  dashboardAuth?: string; // Basic auth for dashboard
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export interface RouteConfig {
  name: string; // Unique route name
  host: string; // Host pattern for routing
  service: string; // Target service name
  port: number; // Target port
  middlewares?: string[]; // Applied middlewares
  tls?: boolean; // Enable TLS for this route
  priority?: number; // Route priority
}

export interface ContainerRoute {
  containerId: string;
  containerName: string;
  userId: number;
  repositoryId: number;
  branchName: string;
  subdomain: string;
  url: string;
}

export class TraefikService {
  private config: TraefikConfig;
  private logger: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void;
  private configPath: string;
  private dynamicConfigPath: string;

  constructor(
    config: TraefikConfig,
    logger?: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void
  ) {
    this.config = config;
    this.logger = logger || ((level, message, metadata) => {
      console[level](`[TraefikService] ${message}`, metadata || '');
    });
    
    this.configPath = join(process.cwd(), 'traefik');
    this.dynamicConfigPath = join(this.configPath, 'dynamic.yml');
    
    // Ensure config directory exists
    if (!existsSync(this.configPath)) {
      mkdirSync(this.configPath, { recursive: true });
    }
  }

  /**
   * Initialize Traefik service
   */
  async initialize(): Promise<void> {
    try {
      // Ensure Docker network exists
      await this.ensureNetwork();
      
      // Generate dynamic configuration
      await this.generateDynamicConfig();
      
      // Start Traefik if not running
      await this.ensureTraefikRunning();
      
      this.logger('info', 'Traefik service initialized', {
        domain: this.config.domain,
        networkName: this.config.networkName,
        enableTLS: this.config.enableTLS,
      });
    } catch (error) {
      this.logger('error', 'Failed to initialize Traefik service', { error });
      throw new Error(`Traefik service initialization failed: ${error}`);
    }
  }

  /**
   * Register a new container route with Traefik
   */
  async registerContainerRoute(params: {
    containerId: string;
    containerName: string;
    userId: number;
    repositoryId: number;
    branchName: string;
  }): Promise<ContainerRoute> {
    try {
      const subdomain = this.generateSubdomain(params.userId, params.repositoryId, params.branchName);
      const host = `${subdomain}.${this.config.domain}`;
      const url = `${this.config.enableTLS ? 'https' : 'http'}://${host}`;

      const route: RouteConfig = {
        name: params.containerName,
        host,
        service: params.containerName,
        port: 8080,
        middlewares: ['ide-session'],
        tls: this.config.enableTLS,
        priority: 100,
      };

      // Update container labels for Traefik discovery
      await this.updateContainerLabels(params.containerId, route);

      const containerRoute: ContainerRoute = {
        containerId: params.containerId,
        containerName: params.containerName,
        userId: params.userId,
        repositoryId: params.repositoryId,
        branchName: params.branchName,
        subdomain,
        url,
      };

      this.logger('info', 'Container route registered', {
        containerId: params.containerId,
        subdomain,
        url,
      });

      return containerRoute;
    } catch (error) {
      this.logger('error', 'Failed to register container route', {
        containerId: params.containerId,
        error,
      });
      throw new Error(`Route registration failed: ${error}`);
    }
  }

  /**
   * Unregister a container route from Traefik
   */
  async unregisterContainerRoute(containerId: string): Promise<void> {
    try {
      // Remove Traefik labels from container
      await this.removeContainerLabels(containerId);

      this.logger('info', 'Container route unregistered', { containerId });
    } catch (error) {
      this.logger('error', 'Failed to unregister container route', {
        containerId,
        error,
      });
      throw new Error(`Route unregistration failed: ${error}`);
    }
  }

  /**
   * Get all registered routes
   */
  async getRegisteredRoutes(): Promise<ContainerRoute[]> {
    try {
      // Query Docker for containers with Traefik labels
      const output = execSync(
        `docker ps --filter "label=traefik.enable=true" --filter "label=cloud-ide-orchestrator.managed=true" --format "{{.ID}}|{{.Names}}|{{.Label \\"cloud-ide-orchestrator.user-id\\"}}|{{.Label \\"cloud-ide-orchestrator.repository-id\\"}}|{{.Label \\"cloud-ide-orchestrator.branch-name\\"}}"`,
        { encoding: 'utf-8' }
      );

      const routes: ContainerRoute[] = [];
      const lines = output.trim().split('\n').filter(line => line);

      for (const line of lines) {
        const [containerId, containerName, userId, repositoryId, branchName] = line.split('|');
        
        if (containerId && containerName && userId && repositoryId && branchName) {
          const subdomain = this.generateSubdomain(
            parseInt(userId), 
            parseInt(repositoryId), 
            branchName
          );
          const url = `${this.config.enableTLS ? 'https' : 'http'}://${subdomain}.${this.config.domain}`;

          routes.push({
            containerId,
            containerName,
            userId: parseInt(userId),
            repositoryId: parseInt(repositoryId),
            branchName,
            subdomain,
            url,
          });
        }
      }

      return routes;
    } catch (error) {
      this.logger('error', 'Failed to get registered routes', { error });
      return [];
    }
  }

  /**
   * Test route connectivity
   */
  async testRoute(url: string): Promise<boolean> {
    try {
      // Simple HTTP check to verify route is accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      this.logger('warn', 'Route test failed', { url, error });
      return false;
    }
  }

  /**
   * Get Traefik dashboard URL
   */
  getDashboardUrl(): string | null {
    if (!this.config.enableDashboard) {
      return null;
    }
    
    const protocol = this.config.enableTLS ? 'https' : 'http';
    return `${protocol}://traefik.${this.config.domain}`;
  }

  /**
   * Get Traefik service status
   */
  async getServiceStatus(): Promise<{
    running: boolean;
    containerId?: string;
    uptime?: string;
    version?: string;
  }> {
    try {
      const output = execSync(
        'docker ps --filter "name=cloud-ide-traefik" --format "{{.ID}}|{{.Status}}|{{.Image}}"',
        { encoding: 'utf-8' }
      );

      if (!output.trim()) {
        return { running: false };
      }

      const [containerId, status, image] = output.trim().split('|');
      const version = image?.split(':')[1] || 'unknown';

      return {
        running: true,
        containerId,
        uptime: status,
        version,
      };
    } catch (error) {
      this.logger('error', 'Failed to get Traefik status', { error });
      return { running: false };
    }
  }

  // Private helper methods

  private generateSubdomain(userId: number, repositoryId: number, branchName: string): string {
    // Create a safe subdomain from user, repo, and branch
    const safeBranchName = branchName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    return `ide-u${userId}-r${repositoryId}-${safeBranchName}`;
  }

  private async ensureNetwork(): Promise<void> {
    try {
      // Check if network exists
      const output = execSync(
        `docker network ls --filter "name=${this.config.networkName}" --format "{{.Name}}"`,
        { encoding: 'utf-8' }
      );

      if (!output.includes(this.config.networkName)) {
        this.logger('info', 'Creating Docker network', { networkName: this.config.networkName });
        
        execSync(`docker network create ${this.config.networkName}`, { encoding: 'utf-8' });
      }
    } catch (error) {
      this.logger('error', 'Failed to ensure network exists', {
        networkName: this.config.networkName,
        error,
      });
      throw error;
    }
  }

  private async generateDynamicConfig(): Promise<void> {
    try {
      // Read the template dynamic config
      const templatePath = join(process.cwd(), 'traefik', 'dynamic.yml');
      let dynamicConfig = '';

      if (existsSync(templatePath)) {
        dynamicConfig = readFileSync(templatePath, 'utf-8');
      } else {
        // Generate basic dynamic config if template doesn't exist
        dynamicConfig = this.getBasicDynamicConfig();
      }

      // Replace environment variables
      dynamicConfig = dynamicConfig.replace(/\$\{DOMAIN:-localhost\}/g, this.config.domain);
      dynamicConfig = dynamicConfig.replace(/\$\{ACME_EMAIL:-admin@example\.com\}/g, this.config.acmeEmail);

      // Write the processed config
      writeFileSync(this.dynamicConfigPath, dynamicConfig);

      this.logger('info', 'Dynamic configuration generated', {
        configPath: this.dynamicConfigPath,
      });
    } catch (error) {
      this.logger('error', 'Failed to generate dynamic config', { error });
      throw error;
    }
  }

  private getBasicDynamicConfig(): string {
    return `# Basic dynamic configuration for Traefik
http:
  middlewares:
    security-headers:
      headers:
        frameDeny: true
        contentTypeNosniff: true
        browserXssFilter: true
        referrerPolicy: "strict-origin-when-cross-origin"
        customRequestHeaders:
          X-Forwarded-Proto: "https"
    
    rate-limit:
      rateLimit:
        burst: 100
        average: 50
        period: "1m"
    
    ide-session:
      chain:
        middlewares:
          - security-headers
          - rate-limit

tls:
  options:
    default:
      minVersion: "VersionTLS12"
`;
  }

  private async ensureTraefikRunning(): Promise<void> {
    try {
      const status = await this.getServiceStatus();
      
      if (!status.running) {
        this.logger('info', 'Starting Traefik service');
        
        // Start Traefik using docker-compose
        execSync('docker-compose -f docker-compose.traefik.yml up -d', {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DOMAIN: this.config.domain,
            ACME_EMAIL: this.config.acmeEmail,
            TRAEFIK_LOG_LEVEL: this.config.logLevel,
            TRAEFIK_INSECURE: this.config.enableDashboard ? 'true' : 'false',
          },
        });
        
        // Wait for Traefik to be ready
        await this.waitForTraefikReady();
      }
    } catch (error) {
      this.logger('error', 'Failed to ensure Traefik is running', { error });
      throw error;
    }
  }

  private async waitForTraefikReady(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getServiceStatus();
        if (status.running) {
          return;
        }
      } catch {
        // Service not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Traefik failed to become ready within ${timeoutMs}ms`);
  }

  private async updateContainerLabels(containerId: string, route: RouteConfig): Promise<void> {
    try {
      const labels = [
        'traefik.enable=true',
        `traefik.http.routers.${route.name}.rule=Host(\`${route.host}\`)`,
        `traefik.http.routers.${route.name}.entrypoints=websecure`,
        `traefik.http.services.${route.name}.loadbalancer.server.port=${route.port}`,
        `traefik.docker.network=${this.config.networkName}`,
      ];

      if (route.tls) {
        labels.push(`traefik.http.routers.${route.name}.tls=true`);
        labels.push(`traefik.http.routers.${route.name}.tls.certresolver=letsencrypt`);
      }

      if (route.middlewares && route.middlewares.length > 0) {
        labels.push(`traefik.http.routers.${route.name}.middlewares=${route.middlewares.join(',')}`);
      }

      if (route.priority) {
        labels.push(`traefik.http.routers.${route.name}.priority=${route.priority}`);
      }

      // Update container labels
      for (const label of labels) {
        const [key, value] = label.split('=', 2);
        execSync(`docker update --label-add "${key}=${value}" ${containerId}`, {
          encoding: 'utf-8',
        });
      }

      this.logger('info', 'Container labels updated for Traefik routing', {
        containerId,
        host: route.host,
      });
    } catch (error) {
      this.logger('error', 'Failed to update container labels', {
        containerId,
        error,
      });
      throw error;
    }
  }

  private async removeContainerLabels(containerId: string): Promise<void> {
    try {
      // Get current container labels
      const output = execSync(
        `docker inspect ${containerId} --format "{{range $key, $value := .Config.Labels}}{{$key}}={{$value}}\n{{end}}"`,
        { encoding: 'utf-8' }
      );

      const traefikLabels = output
        .split('\n')
        .filter(line => line.startsWith('traefik.'))
        .map(line => line.split('=')[0]);

      // Remove Traefik labels
      for (const label of traefikLabels) {
        execSync(`docker update --label-rm "${label}" ${containerId}`, {
          encoding: 'utf-8',
        });
      }

      this.logger('info', 'Traefik labels removed from container', { containerId });
    } catch (error) {
      this.logger('error', 'Failed to remove container labels', {
        containerId,
        error,
      });
      throw error;
    }
  }
}

// Default configuration factory
export function createDefaultTraefikConfig(): TraefikConfig {
  return {
    domain: process.env.DOMAIN || 'localhost',
    networkName: process.env.DOCKER_NETWORK_NAME || 'cloud-ide-network',
    enableTLS: process.env.ENABLE_TLS === 'true',
    acmeEmail: process.env.ACME_EMAIL || 'admin@example.com',
    enableDashboard: process.env.TRAEFIK_DASHBOARD === 'true',
    dashboardAuth: process.env.TRAEFIK_BASIC_AUTH,
    logLevel: (process.env.TRAEFIK_LOG_LEVEL as any) || 'INFO',
  };
}

// Singleton instance for the application
let traefikServiceInstance: TraefikService | null = null;

export function getTraefikService(): TraefikService {
  if (!traefikServiceInstance) {
    const config = createDefaultTraefikConfig();
    traefikServiceInstance = new TraefikService(config);
  }
  return traefikServiceInstance;
}