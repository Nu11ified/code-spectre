import { simpleGit, type SimpleGit, GitError } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

// Import ssh-keygen as a CommonJS module
const sshKeygen = require('ssh-keygen');
const generateKeyPairAsync = promisify(sshKeygen);

export interface GitServiceConfig {
  repositoriesPath: string; // Base path for cloned repositories
  worktreesPath: string;    // Base path for worktrees
  sshKeysPath: string;      // Path to store SSH keys
}

export interface DeployKey {
  publicKey: string;
  privateKey: string;
  keyPath: string;
}

export interface GitOperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface BranchInfo {
  name: string;
  commit: string;
  isRemote: boolean;
}

export class GitService {
  private config: GitServiceConfig;
  private logger: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void;

  constructor(
    config: GitServiceConfig,
    logger?: (level: 'info' | 'warn' | 'error', message: string, metadata?: any) => void
  ) {
    this.config = config;
    this.logger = logger || ((level, message, metadata) => {
      console[level](`[GitService] ${message}`, metadata || '');
    });
  }

  /**
   * Initialize the Git service by ensuring required directories exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.repositoriesPath, { recursive: true });
      await fs.mkdir(this.config.worktreesPath, { recursive: true });
      await fs.mkdir(this.config.sshKeysPath, { recursive: true });
      
      this.logger('info', 'Git service initialized', {
        repositoriesPath: this.config.repositoriesPath,
        worktreesPath: this.config.worktreesPath,
        sshKeysPath: this.config.sshKeysPath,
      });
    } catch (error) {
      this.logger('error', 'Failed to initialize Git service', { error });
      throw new Error(`Git service initialization failed: ${error}`);
    }
  }

  /**
   * Generate SSH deploy key pair for repository access
   */
  async generateDeployKey(repositoryId: number): Promise<DeployKey> {
    try {
      const keyPath = path.join(this.config.sshKeysPath, `repo_${repositoryId}`);
      
      const keyPair = await generateKeyPairAsync({
        type: 'rsa',
        bits: 4096,
        comment: `deploy-key-repo-${repositoryId}`,
        location: keyPath,
        read: true,
      });

      if (!keyPair) {
        throw new Error('Key pair generation returned undefined');
      }

      this.logger('info', 'Deploy key generated', { repositoryId, keyPath });

      return {
        publicKey: keyPair.pubKey,
        privateKey: keyPair.key,
        keyPath,
      };
    } catch (error) {
      this.logger('error', 'Failed to generate deploy key', { repositoryId, error });
      throw new Error(`Deploy key generation failed: ${error}`);
    }
  }

  /**
   * Clone a repository using SSH deploy key
   */
  async cloneRepository(
    gitUrl: string,
    repositoryId: number,
    deployKeyPath?: string
  ): Promise<GitOperationResult> {
    try {
      const repoPath = this.getRepositoryPath(repositoryId);
      
      // Check if repository already exists
      try {
        await fs.access(repoPath);
        this.logger('info', 'Repository already exists', { repositoryId, repoPath });
        return { success: true, message: 'Repository already exists' };
      } catch {
        // Repository doesn't exist, proceed with cloning
      }

      const git = this.createGitInstance(deployKeyPath);
      
      this.logger('info', 'Starting repository clone', { gitUrl, repositoryId, repoPath });
      
      await git.clone(gitUrl, repoPath, ['--bare']);
      
      this.logger('info', 'Repository cloned successfully', { repositoryId, repoPath });
      
      return { success: true, message: 'Repository cloned successfully' };
    } catch (error) {
      const errorMessage = error instanceof GitError ? error.message : String(error);
      this.logger('error', 'Repository clone failed', { gitUrl, repositoryId, error: errorMessage });
      
      return { 
        success: false, 
        error: `Clone failed: ${errorMessage}` 
      };
    }
  }

  /**
   * Create a worktree for a specific branch
   */
  async createWorktree(
    repositoryId: number,
    branchName: string,
    userId: number
  ): Promise<GitOperationResult> {
    try {
      const repoPath = this.getRepositoryPath(repositoryId);
      const worktreePath = this.getWorktreePath(repositoryId, branchName, userId);
      
      // Check if worktree already exists
      try {
        await fs.access(worktreePath);
        this.logger('info', 'Worktree already exists', { repositoryId, branchName, userId, worktreePath });
        return { success: true, message: 'Worktree already exists' };
      } catch {
        // Worktree doesn't exist, proceed with creation
      }

      const git = simpleGit(repoPath);
      
      // Fetch latest changes
      await git.fetch();
      
      // Create worktree
      await git.raw(['worktree', 'add', worktreePath, `origin/${branchName}`]);
      
      this.logger('info', 'Worktree created successfully', { 
        repositoryId, 
        branchName, 
        userId, 
        worktreePath 
      });
      
      return { success: true, message: 'Worktree created successfully' };
    } catch (error) {
      const errorMessage = error instanceof GitError ? error.message : String(error);
      this.logger('error', 'Worktree creation failed', { 
        repositoryId, 
        branchName, 
        userId, 
        error: errorMessage 
      });
      
      return { 
        success: false, 
        error: `Worktree creation failed: ${errorMessage}` 
      };
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(
    repositoryId: number,
    branchName: string,
    userId: number
  ): Promise<GitOperationResult> {
    try {
      const repoPath = this.getRepositoryPath(repositoryId);
      const worktreePath = this.getWorktreePath(repositoryId, branchName, userId);
      
      const git = simpleGit(repoPath);
      
      // Remove worktree
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
      
      this.logger('info', 'Worktree removed successfully', { 
        repositoryId, 
        branchName, 
        userId, 
        worktreePath 
      });
      
      return { success: true, message: 'Worktree removed successfully' };
    } catch (error) {
      const errorMessage = error instanceof GitError ? error.message : String(error);
      this.logger('error', 'Worktree removal failed', { 
        repositoryId, 
        branchName, 
        userId, 
        error: errorMessage 
      });
      
      return { 
        success: false, 
        error: `Worktree removal failed: ${errorMessage}` 
      };
    }
  }

  /**
   * List all branches in a repository
   */
  async listBranches(repositoryId: number): Promise<BranchInfo[]> {
    try {
      const repoPath = this.getRepositoryPath(repositoryId);
      const git = simpleGit(repoPath);
      
      // Fetch latest changes
      await git.fetch();
      
      // Get all branches (local and remote)
      const branches = await git.branch(['-a']);
      
      const branchInfo: BranchInfo[] = [];
      
      // Process remote branches
      for (const [branchName, branchData] of Object.entries(branches.branches)) {
        if (branchName.startsWith('remotes/origin/') && branchName !== 'remotes/origin/HEAD') {
          const cleanName = branchName.replace('remotes/origin/', '');
          branchInfo.push({
            name: cleanName,
            commit: branchData.commit,
            isRemote: true,
          });
        }
      }
      
      this.logger('info', 'Branches listed successfully', { 
        repositoryId, 
        branchCount: branchInfo.length 
      });
      
      return branchInfo;
    } catch (error) {
      const errorMessage = error instanceof GitError ? error.message : String(error);
      this.logger('error', 'Branch listing failed', { repositoryId, error: errorMessage });
      throw new Error(`Branch listing failed: ${errorMessage}`);
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(
    repositoryId: number,
    branchName: string,
    baseBranch: string = 'main'
  ): Promise<GitOperationResult> {
    try {
      const repoPath = this.getRepositoryPath(repositoryId);
      const git = simpleGit(repoPath);
      
      // Fetch latest changes
      await git.fetch();
      
      // Create new branch from base branch
      await git.checkoutBranch(branchName, `origin/${baseBranch}`);
      
      // Push the new branch to remote
      await git.push('origin', branchName);
      
      this.logger('info', 'Branch created successfully', { 
        repositoryId, 
        branchName, 
        baseBranch 
      });
      
      return { success: true, message: 'Branch created successfully' };
    } catch (error) {
      const errorMessage = error instanceof GitError ? error.message : String(error);
      this.logger('error', 'Branch creation failed', { 
        repositoryId, 
        branchName, 
        baseBranch, 
        error: errorMessage 
      });
      
      return { 
        success: false, 
        error: `Branch creation failed: ${errorMessage}` 
      };
    }
  }

  /**
   * Update repository by fetching latest changes
   */
  async updateRepository(repositoryId: number): Promise<GitOperationResult> {
    try {
      const repoPath = this.getRepositoryPath(repositoryId);
      const git = simpleGit(repoPath);
      
      await git.fetch(['--all', '--prune']);
      
      this.logger('info', 'Repository updated successfully', { repositoryId });
      
      return { success: true, message: 'Repository updated successfully' };
    } catch (error) {
      const errorMessage = error instanceof GitError ? error.message : String(error);
      this.logger('error', 'Repository update failed', { repositoryId, error: errorMessage });
      
      return { 
        success: false, 
        error: `Repository update failed: ${errorMessage}` 
      };
    }
  }

  /**
   * Clean up all worktrees for a repository
   */
  async cleanupWorktrees(repositoryId: number): Promise<GitOperationResult> {
    try {
      const repoPath = this.getRepositoryPath(repositoryId);
      const git = simpleGit(repoPath);
      
      // Prune worktrees (removes worktrees that no longer exist on disk)
      await git.raw(['worktree', 'prune']);
      
      this.logger('info', 'Worktrees cleaned up successfully', { repositoryId });
      
      return { success: true, message: 'Worktrees cleaned up successfully' };
    } catch (error) {
      const errorMessage = error instanceof GitError ? error.message : String(error);
      this.logger('error', 'Worktree cleanup failed', { repositoryId, error: errorMessage });
      
      return { 
        success: false, 
        error: `Worktree cleanup failed: ${errorMessage}` 
      };
    }
  }

  /**
   * Get the file system path for a repository
   */
  getRepositoryPath(repositoryId: number): string {
    return path.join(this.config.repositoriesPath, `repo_${repositoryId}.git`);
  }

  /**
   * Get the file system path for a worktree
   */
  getWorktreePath(repositoryId: number, branchName: string, userId: number): string {
    const safeBranchName = branchName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(
      this.config.worktreesPath, 
      `repo_${repositoryId}`, 
      `user_${userId}`, 
      safeBranchName
    );
  }

  /**
   * Create a Git instance with optional SSH key configuration
   */
  private createGitInstance(deployKeyPath?: string): SimpleGit {
    const options: any = {};
    
    if (deployKeyPath) {
      options.config = [
        `core.sshCommand=ssh -i ${deployKeyPath} -o StrictHostKeyChecking=no`
      ];
    }
    
    return simpleGit(options);
  }

  /**
   * Validate branch name according to Git naming conventions
   */
  static validateBranchName(branchName: string): { valid: boolean; error?: string } {
    if (branchName.length === 0) {
      return { valid: false, error: 'Branch name cannot be empty' };
    }

    if (branchName.length > 250) {
      return { valid: false, error: 'Branch name too long (max 250 characters)' };
    }

    // Git branch naming rules
    const invalidPatterns = [
      { pattern: /^-/, message: 'Cannot start with dash' },
      { pattern: /\.\./, message: 'Cannot contain double dots' },
      { pattern: /\/$/, message: 'Cannot end with slash' },
      { pattern: /^\//, message: 'Cannot start with slash' },
      { pattern: /\/\//, message: 'Cannot contain double slash' },
      { pattern: /[\x00-\x1f\x7f]/, message: 'Cannot contain control characters' },
      { pattern: /[~^:?*\[\]\\]/, message: 'Cannot contain special characters' },
      { pattern: /\.$/, message: 'Cannot end with dot' },
      { pattern: /\.lock$/, message: 'Cannot end with .lock' },
      { pattern: /@\{/, message: 'Cannot contain @{' },
      { pattern: /\s/, message: 'Cannot contain whitespace' },
    ];

    for (const { pattern, message } of invalidPatterns) {
      if (pattern.test(branchName)) {
        return { 
          valid: false, 
          error: message
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate Git URL format
   */
  static validateGitUrl(gitUrl: string): { valid: boolean; error?: string } {
    const sshPattern = /^git@[^:]+:[^\/]+\/[^\/]+\.git$/;
    const httpsPattern = /^https:\/\/[^\/]+\/[^\/]+\/[^\/]+\.git$/;
    
    if (!sshPattern.test(gitUrl) && !httpsPattern.test(gitUrl)) {
      return { 
        valid: false, 
        error: 'Git URL must be in SSH (git@host:user/repo.git) or HTTPS (https://host/user/repo.git) format' 
      };
    }
    
    return { valid: true };
  }
}

// Default configuration factory
export function createDefaultGitConfig(): GitServiceConfig {
  const baseDir = process.env.GIT_BASE_DIR || '/srv/git';
  
  return {
    repositoriesPath: path.join(baseDir, 'repositories'),
    worktreesPath: path.join(baseDir, 'worktrees'),
    sshKeysPath: path.join(baseDir, 'ssh-keys'),
  };
}

// Singleton instance for the application
let gitServiceInstance: GitService | null = null;

export function getGitService(): GitService {
  if (!gitServiceInstance) {
    const config = createDefaultGitConfig();
    gitServiceInstance = new GitService(config);
  }
  return gitServiceInstance;
}