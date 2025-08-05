// Test script to verify database schema and queries are working
// This file can be run to test the database setup

import { userQueries, repositoryQueries, permissionQueries } from "./queries";

export async function testDatabaseSchema() {
  try {
    console.log("Testing database schema and queries...");

    // Test 1: Create a test user
    console.log("1. Testing user creation...");
    const testUser = await userQueries.upsertFromGithub({
      githubId: "test-123",
      githubUsername: "testuser",
      email: "test@example.com",
    });
    console.log("✓ User created:", testUser.githubUsername);

    // Test 2: Create a test repository
    console.log("2. Testing repository creation...");
    const testRepo = await repositoryQueries.create({
      name: "test-repo",
      gitUrl: "https://github.com/test/repo.git",
      ownerId: testUser.id,
    });
    console.log("✓ Repository created:", testRepo.name);

    // Test 3: Create permissions
    console.log("3. Testing permission creation...");
    const testPermission = await permissionQueries.upsert({
      userId: testUser.id,
      repositoryId: testRepo.id,
      canCreateBranches: true,
      branchLimit: 10,
      allowedBaseBranches: ["main", "develop", "staging"],
      allowTerminalAccess: true,
    });
    console.log("✓ Permission created for user:", testUser.githubUsername);

    // Test 4: Query user repositories
    console.log("4. Testing user repository query...");
    const userRepos = await repositoryQueries.getByUserId(testUser.id);
    console.log("✓ User has access to", userRepos.length, "repositories");

    // Test 5: Query user permissions
    console.log("5. Testing permission query...");
    const userPermissions = await permissionQueries.getByUserAndRepository(
      testUser.id,
      testRepo.id
    );
    console.log("✓ User permissions:", {
      canCreateBranches: userPermissions?.canCreateBranches,
      branchLimit: userPermissions?.branchLimit,
      allowTerminalAccess: userPermissions?.allowTerminalAccess,
    });

    console.log("\n🎉 All database tests passed! Schema is working correctly.");
    
    return {
      success: true,
      testUser,
      testRepo,
      testPermission,
    };
  } catch (error) {
    console.error("❌ Database test failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Export for potential use in other test files
export { testDatabaseSchema as default };