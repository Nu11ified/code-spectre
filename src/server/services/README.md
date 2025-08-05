# Cloud IDE Orchestrator Services

This directory contains the core services for the Cloud IDE Orchestrator platform.

## Services Overview

### SessionManager (`session-manager.ts`)

The SessionManager is the main orchestration service that coordinates Git and Docker services to create and manage IDE sessions.

**Key Features:**

- Creates isolated IDE sessions for users on specific repository branches
- Manages session lifecycle (create, stop, cleanup)
- Implements permission validation and resource limits
- Provides session monitoring and health checks
- Handles unique URL generation for secure access

**Main Methods:**

- `createSession(params)` - Creates a new IDE session
- `stopSession(sessionId)` - Stops and cleans up a session
- `getUserSessions(userId)` - Lists active sessions for a user
- `performHealthChecks()` - Checks health of all sessions
- `cleanupInactiveSessions()` - Removes inactive sessions

### GitService (`git.ts`)

Handles all Git operations including repository cloning, worktree management, and branch operations.

**Key Features:**

- Repository cloning with SSH deploy keys
- Worktree creation and management for branch isolation
- Branch listing and creation
- Git credential management

### DockerService (`docker.ts`)

Manages Docker containers for IDE sessions with proper resource limits and isolation.

**Key Features:**

- Container creation with code-server
- Resource limit enforcement
- Container lifecycle management
- Health monitoring and statistics

## Usage Example

```typescript
import { getSessionManager } from '@/server/services/session-manager';

const sessionManager = getSessionManager();

// Create a new IDE session
const session = await sessionManager.createSession({
  userId: 1,
  repositoryId: 1,
  branchName: 'feat/new-feature',
  permissions: {
    canCreateBranches: true,
    branchLimit: 5,
    allowedBaseBranches: ['main', 'develop'],
    allowTerminalAccess: true,
  },
});

console.log(`Session created: ${session.containerUrl}`);
```

## API Integration

The services are integrated with tRPC through the session router (`/api/routers/session.ts`):

- `session.start` - Start a new IDE session
- `session.stop` - Stop an IDE session
- `session.getMySessions` - Get user's active sessions
- `session.getSessionStatus` - Get session status and health
- `session.heartbeat` - Update session activity

## Configuration

Services can be configured through environment variables:

```env
# Git service
GIT_BASE_DIR=/srv/git
EXTENSIONS_PATH=/srv/extensions

# Docker service
DOCKER_SOCKET_PATH=/var/run/docker.sock
CODE_SERVER_IMAGE=codercom/code-server:latest
DOCKER_NETWORK_NAME=cloud-ide-network
SESSION_TIMEOUT_MINUTES=60
MAX_CONTAINERS=50
DEFAULT_MEMORY_LIMIT=2g
DEFAULT_CPU_LIMIT=1.0
```

## Security Considerations

1. **Container Isolation**: Each session runs in an isolated Docker container
2. **File System Isolation**: Users can only access their assigned worktree
3. **Network Isolation**: Containers have restricted network access
4. **Unique URLs**: Each session gets a unique, secure URL
5. **Permission Validation**: All operations are validated against user permissions

## Monitoring and Cleanup

The system includes automatic cleanup mechanisms:

- Inactive sessions are automatically stopped after timeout
- Orphaned worktrees are cleaned up
- Container resources are monitored and limited
- Health checks ensure system stability

## Testing

Each service includes comprehensive unit tests:

- `__tests__/session-manager.test.ts` - SessionManager tests
- `__tests__/git.test.ts` - GitService tests  
- `__tests__/docker.test.ts` - DockerService tests

Run tests with:

```bash
npm test -- --run src/server/services/__tests__/
```
