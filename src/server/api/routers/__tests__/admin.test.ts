import { describe, it, expect } from 'vitest';

describe('Admin Router Validation', () => {
  it('should validate repository name format', () => {
    const validNames = ['test-repo', 'my_project', 'repo.name', 'project123'];
    const invalidNames = ['test repo', 'repo with spaces', 'repo@name', 'repo#name'];

    const nameRegex = /^[a-zA-Z0-9\-_.]+$/;

    validNames.forEach(name => {
      expect(name).toMatch(nameRegex);
    });

    invalidNames.forEach(name => {
      expect(name).not.toMatch(nameRegex);
    });
  });

  it('should validate git URL format', () => {
    const validUrls = [
      'https://github.com/user/repo.git',
      'http://gitlab.com/user/repo.git',
      'git@github.com:user/repo.git',
    ];
    
    const invalidUrls = [
      'https://github.com/user/repo',
      'not-a-url',
      'ftp://example.com/repo.git',
    ];

    const gitUrlRegex = /^https?:\/\/.+\.git$|^git@.+:.+\.git$/;

    validUrls.forEach(url => {
      expect(url).toMatch(gitUrlRegex);
    });

    invalidUrls.forEach(url => {
      expect(url).not.toMatch(gitUrlRegex);
    });
  });

  it('should validate extension ID format', () => {
    const validIds = ['ms-python.python', 'publisher.extension', 'my-pub.my-ext'];
    const invalidIds = ['invalid-id', 'no-dot', 'too.many.dots.here'];

    const extensionIdRegex = /^[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+$/;

    validIds.forEach(id => {
      expect(id).toMatch(extensionIdRegex);
    });

    invalidIds.forEach(id => {
      expect(id).not.toMatch(extensionIdRegex);
    });
  });

  it('should validate semantic version format', () => {
    const validVersions = ['1.0.0', '2.1.3', '1.0.0-beta', '1.2.3-alpha.1'];
    const invalidVersions = ['1.0', '1', 'invalid', '1.0.0.0'];

    const versionRegex = /^\d+\.\d+\.\d+(-.*)?$/;

    validVersions.forEach(version => {
      expect(version).toMatch(versionRegex);
    });

    invalidVersions.forEach(version => {
      expect(version).not.toMatch(versionRegex);
    });
  });

  it('should validate user roles', () => {
    const validRoles = ['admin', 'user'];
    const invalidRoles = ['superuser', 'guest', 'moderator'];

    validRoles.forEach(role => {
      expect(['admin', 'user']).toContain(role);
    });

    invalidRoles.forEach(role => {
      expect(['admin', 'user']).not.toContain(role);
    });
  });
});