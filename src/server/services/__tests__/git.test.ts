import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitService, type GitServiceConfig, createDefaultGitConfig } from '../git';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock dependencies
vi.mock('simple-git');
vi.mock('ssh-keygen');

const mockSimpleGit = vi.hoisted(() => ({
  simpleGit: vi.fn(),
  GitError: class GitError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'GitError';
    }
  }
}));

const mockSshKeygen = vi.hoisted(() => ({
  generateKeyPair: vi.fn()
}));

vi.mock('simple-git', () => mockSimpleGit);
vi.mock('ssh-keygen', () => mockSshKeygen);

describe('GitService', () => {
  let gitService: GitService;
  let testConfig: GitServiceConfig;
  let tempDir: string;
  let mockLogger: ReturnType<typeof vi.fn>;
  let mockGitInstance: any;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-service-test-'));
    
    testConfig = {
      repositoriesPath: path.join(tempDir, 'repositories'),
      worktreesPath: path.join(tempDir, 'worktrees'),
      sshKeysPath: path.join(tempDir, 'ssh-keys'),
    };

    mockLogger = vi.fn();
    gitService = new GitService(testConfig, mockLogger);

    // Mock git instance
    mockGitInstance = {
      clone: vi.fn(),
      fetch: vi.fn(),
      raw: vi.fn(),
      branch: vi.fn(),
      checkoutBranch: vi.fn(),
      push: vi.fn(),
    };

    mockSimpleGit.simpleGit.mockReturnValue(mockGitInstance);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create required directories', async () => {
      await gitService.initialize();

      // Check that directories were created
      await expect(fs.access(testConfig.repositoriesPath)).resolves.not.toThrow();
      await expect(fs.access(testConfig.worktreesPath)).resolves.not.toThrow();
      await expect(fs.access(testConfig.sshKeysPath)).resolves.not.toThrow();

      expect(mockLogger).toHaveBeenCalledWith('info', 'Git service initialized', {
        repositoriesPath: testConfig.repositoriesPath,
        worktreesPath: testConfig.worktreesPath,
        sshKeysPath: testConfig.sshKeysPath,
      });
    });

    it('should handle directory creation errors', async () => {
      // Create a new service instance with invalid path to trigger error
      const invalidConfig = {
        ...testConfig,
        repositoriesPath: '/invalid/path/that/cannot/be/created',
      };
      
      const invalidGitService = new GitService(invalidConfig, mockLogger);

      await expect(invalidGitService.initialize()).rejects.toThrow('Git service initialization failed');
      
      expect(mockLogger).toHaveBeenCalledWith('error', 'Failed to initialize Git service', 
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('generateDeployKey', () => {
    it('should generate SSH key pair', async () => {
      const mockKeyPair = {
        key: 'private-key-content',
        pubKey: 'public-key-content',
      };

      mockSshKeygen.generateKeyPair.mockImplementation((options, callback) => {
        callback(null, mockKeyPair);
      });

      const result = await gitService.generateDeployKey(123);

      expect(result).toEqual({
        publicKey: 'public-key-content',
        privateKey: 'private-key-content',
        keyPath: path.join(testConfig.sshKeysPath, 'repo_123'),
      });

      expect(mockSshKeygen.generateKeyPair).toHaveBeenCalledWith({
        type: 'rsa',
        bits: 4096,
        comment: 'deploy-key-repo-123',
        location: path.join(testConfig.sshKeysPath, 'repo_123'),
        read: true,
      }, expect.any(Function));

      expect(mockLogger).toHaveBeenCalledWith('info', 'Deploy key generated', {
        repositoryId: 123,
        keyPath: path.join(testConfig.sshKeysPath, 'repo_123'),
      });
    });

    it('should handle key generation errors', async () => {
      mockSshKeygen.generateKeyPair.mockImplementation((options, callback) => {
        callback(new Error('Key generation failed'));
      });

      await expect(gitService.generateDeployKey(123)).rejects.toThrow('Deploy key generation failed');

      expect(mockLogger).toHaveBeenCalledWith('error', 'Failed to generate deploy key', {
        repositoryId: 123,
        error: expect.any(Error),
      });
    });
  });

  describe('cloneRepository', () => {
    it('should clone repository successfully', async () => {
      const gitUrl = 'git@github.com:user/repo.git';
      const repositoryId = 123;

      mockGitInstance.clone.mockResolvedValue(undefined);

      const result = await gitService.cloneRepository(gitUrl, repositoryId);

      expect(result).toEqual({
        success: true,
        message: 'Repository cloned successfully',
      });

      expect(mockGitInstance.clone).toHaveBeenCalledWith(
        gitUrl,
        path.join(testConfig.repositoriesPath, 'repo_123.git'),
        ['--bare']
      );

      expect(mockLogger).toHaveBeenCalledWith('info', 'Repository cloned successfully', {
        repositoryId: 123,
        repoPath: path.join(testConfig.repositoriesPath, 'repo_123.git'),
      });
    });

    it('should handle existing repository', async () => {
      const gitUrl = 'git@github.com:user/repo.git';
      const repositoryId = 123;
      const repoPath = path.join(testConfig.repositoriesPath, 'repo_123.git');

      // Create the repository directory to simulate existing repo
      await fs.mkdir(path.dirname(repoPath), { recursive: true });
      await fs.mkdir(repoPath);

      const result = await gitService.cloneRepository(gitUrl, repositoryId);

      expect(result).toEqual({
        success: true,
        message: 'Repository already exists',
      });

      expect(mockGitInstance.clone).not.toHaveBeenCalled();
    });

    it('should handle clone errors', async () => {
      const gitUrl = 'git@github.com:user/repo.git';
      const repositoryId = 123;

      mockGitInstance.clone.mockRejectedValue(new mockSimpleGit.GitError('Clone failed'));

      const result = await gitService.cloneRepository(gitUrl, repositoryId);

      expect(result).toEqual({
        success: false,
        error: 'Clone failed: Clone failed',
      });

      expect(mockLogger).toHaveBeenCalledWith('error', 'Repository clone failed', {
        gitUrl,
        repositoryId: 123,
        error: 'Clone failed',
      });
    });
  });

  describe('createWorktree', () => {
    it('should create worktree successfully', async () => {
      const repositoryId = 123;
      const branchName = 'feature/test';
      const userId = 456;

      mockGitInstance.fetch.mockResolvedValue(undefined);
      mockGitInstance.raw.mockResolvedValue(undefined);

      const result = await gitService.createWorktree(repositoryId, branchName, userId);

      expect(result).toEqual({
        success: true,
        message: 'Worktree created successfully',
      });

      expect(mockGitInstance.fetch).toHaveBeenCalled();
      expect(mockGitInstance.raw).toHaveBeenCalledWith([
        'worktree',
        'add',
        path.join(testConfig.worktreesPath, 'repo_123', 'user_456', 'feature_test'),
        'origin/feature/test',
      ]);
    });

    it('should handle existing worktree', async () => {
      const repositoryId = 123;
      const branchName = 'feature/test';
      const userId = 456;
      const worktreePath = path.join(testConfig.worktreesPath, 'repo_123', 'user_456', 'feature_test');

      // Create the worktree directory to simulate existing worktree
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      await fs.mkdir(worktreePath);

      const result = await gitService.createWorktree(repositoryId, branchName, userId);

      expect(result).toEqual({
        success: true,
        message: 'Worktree already exists',
      });

      expect(mockGitInstance.raw).not.toHaveBeenCalled();
    });

    it('should handle worktree creation errors', async () => {
      const repositoryId = 123;
      const branchName = 'feature/test';
      const userId = 456;

      mockGitInstance.fetch.mockResolvedValue(undefined);
      mockGitInstance.raw.mockRejectedValue(new mockSimpleGit.GitError('Worktree creation failed'));

      const result = await gitService.createWorktree(repositoryId, branchName, userId);

      expect(result).toEqual({
        success: false,
        error: 'Worktree creation failed: Worktree creation failed',
      });
    });
  });

  describe('listBranches', () => {
    it('should list branches successfully', async () => {
      const repositoryId = 123;

      mockGitInstance.fetch.mockResolvedValue(undefined);
      mockGitInstance.branch.mockResolvedValue({
        branches: {
          'remotes/origin/main': { commit: 'abc123' },
          'remotes/origin/develop': { commit: 'def456' },
          'remotes/origin/HEAD': { commit: 'abc123' }, // Should be filtered out
        },
      });

      const result = await gitService.listBranches(repositoryId);

      expect(result).toEqual([
        { name: 'main', commit: 'abc123', isRemote: true },
        { name: 'develop', commit: 'def456', isRemote: true },
      ]);

      expect(mockGitInstance.fetch).toHaveBeenCalled();
      expect(mockGitInstance.branch).toHaveBeenCalledWith(['-a']);
    });

    it('should handle branch listing errors', async () => {
      const repositoryId = 123;

      mockGitInstance.fetch.mockResolvedValue(undefined);
      mockGitInstance.branch.mockRejectedValue(new mockSimpleGit.GitError('Branch listing failed'));

      await expect(gitService.listBranches(repositoryId)).rejects.toThrow('Branch listing failed');
    });
  });

  describe('createBranch', () => {
    it('should create branch successfully', async () => {
      const repositoryId = 123;
      const branchName = 'feature/new-feature';
      const baseBranch = 'main';

      mockGitInstance.fetch.mockResolvedValue(undefined);
      mockGitInstance.checkoutBranch.mockResolvedValue(undefined);
      mockGitInstance.push.mockResolvedValue(undefined);

      const result = await gitService.createBranch(repositoryId, branchName, baseBranch);

      expect(result).toEqual({
        success: true,
        message: 'Branch created successfully',
      });

      expect(mockGitInstance.fetch).toHaveBeenCalled();
      expect(mockGitInstance.checkoutBranch).toHaveBeenCalledWith(branchName, `origin/${baseBranch}`);
      expect(mockGitInstance.push).toHaveBeenCalledWith('origin', branchName);
    });

    it('should handle branch creation errors', async () => {
      const repositoryId = 123;
      const branchName = 'feature/new-feature';

      mockGitInstance.fetch.mockResolvedValue(undefined);
      mockGitInstance.checkoutBranch.mockRejectedValue(new mockSimpleGit.GitError('Branch creation failed'));

      const result = await gitService.createBranch(repositoryId, branchName);

      expect(result).toEqual({
        success: false,
        error: 'Branch creation failed: Branch creation failed',
      });
    });
  });

  describe('path utilities', () => {
    it('should generate correct repository path', () => {
      const repoPath = gitService.getRepositoryPath(123);
      expect(repoPath).toBe(path.join(testConfig.repositoriesPath, 'repo_123.git'));
    });

    it('should generate correct worktree path', () => {
      const worktreePath = gitService.getWorktreePath(123, 'feature/test', 456);
      expect(worktreePath).toBe(path.join(testConfig.worktreesPath, 'repo_123', 'user_456', 'feature_test'));
    });

    it('should sanitize branch names in worktree paths', () => {
      const worktreePath = gitService.getWorktreePath(123, 'feature/test@special!', 456);
      expect(worktreePath).toBe(path.join(testConfig.worktreesPath, 'repo_123', 'user_456', 'feature_test_special_'));
    });
  });

  describe('validation methods', () => {
    describe('validateBranchName', () => {
      it('should validate correct branch names', () => {
        const validNames = [
          'main',
          'feature/test',
          'bugfix/issue-123',
          'release/v1.0.0',
        ];

        validNames.forEach(name => {
          const result = GitService.validateBranchName(name);
          expect(result.valid).toBe(true);
        });
      });

      it('should reject invalid branch names', () => {
        const invalidCases = [
          { name: '', expectedError: 'Branch name cannot be empty' },
          { name: '-invalid', expectedError: 'Cannot start with dash' },
          { name: 'invalid..name', expectedError: 'Cannot contain double dots' },
          { name: 'invalid/', expectedError: 'Cannot end with slash' },
          { name: 'invalid~name', expectedError: 'Cannot contain special characters' },
          { name: 'invalid name', expectedError: 'Cannot contain whitespace' },
          { name: 'test.lock', expectedError: 'Cannot end with .lock' },
          { name: 'a'.repeat(251), expectedError: 'Branch name too long (max 250 characters)' },
        ];

        invalidCases.forEach(({ name, expectedError }) => {
          const result = GitService.validateBranchName(name);
          expect(result.valid).toBe(false);
          expect(result.error).toBe(expectedError);
        });
      });
    });

    describe('validateGitUrl', () => {
      it('should validate correct Git URLs', () => {
        const validUrls = [
          'git@github.com:user/repo.git',
          'https://github.com/user/repo.git',
          'git@gitlab.com:user/repo.git',
          'https://gitlab.com/user/repo.git',
        ];

        validUrls.forEach(url => {
          const result = GitService.validateGitUrl(url);
          expect(result.valid).toBe(true);
        });
      });

      it('should reject invalid Git URLs', () => {
        const invalidUrls = [
          'invalid-url',
          'http://github.com/user/repo.git', // http instead of https
          'git@github.com/user/repo.git', // wrong separator
          'https://github.com/user/repo', // missing .git
        ];

        invalidUrls.forEach(url => {
          const result = GitService.validateGitUrl(url);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        });
      });
    });
  });

  describe('createDefaultGitConfig', () => {
    it('should create default configuration', () => {
      const config = createDefaultGitConfig();
      
      expect(config.repositoriesPath).toContain('repositories');
      expect(config.worktreesPath).toContain('worktrees');
      expect(config.sshKeysPath).toContain('ssh-keys');
    });

    it('should use environment variable for base directory', () => {
      const originalEnv = process.env.GIT_BASE_DIR;
      process.env.GIT_BASE_DIR = '/custom/git/path';

      const config = createDefaultGitConfig();
      
      expect(config.repositoriesPath).toBe('/custom/git/path/repositories');
      expect(config.worktreesPath).toBe('/custom/git/path/worktrees');
      expect(config.sshKeysPath).toBe('/custom/git/path/ssh-keys');

      // Restore original environment
      if (originalEnv) {
        process.env.GIT_BASE_DIR = originalEnv;
      } else {
        delete process.env.GIT_BASE_DIR;
      }
    });
  });
});