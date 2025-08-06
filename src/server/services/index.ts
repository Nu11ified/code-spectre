// Service exports and factory functions
export { GitService, type GitServiceConfig, createDefaultGitConfig, getGitService } from './git';
export { DockerService, type DockerServiceConfig, createDefaultDockerConfig, getDockerService } from './docker';
export { SessionManager, type SessionManagerConfig, createDefaultSessionManagerConfig, getSessionManager } from './session-manager';
export { TraefikService, type TraefikConfig, createDefaultTraefikConfig, getTraefikService } from './traefik';
export { SecurityService, type SecurityConfig, createDefaultSecurityConfig, getSecurityService } from './security';

// Service initialization
export async function initializeServices(): Promise<void> {
  const { getGitService } = await import('./git');
  const { getDockerService } = await import('./docker');
  const { getTraefikService } = await import('./traefik');
  
  const gitServiceInstance = getGitService();
  await gitServiceInstance.initialize();
  
  // Traefik is initialized by DockerService
  const dockerServiceInstance = getDockerService();
  await dockerServiceInstance.initialize();
}