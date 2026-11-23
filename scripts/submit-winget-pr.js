#!/usr/bin/env node

/**
 * submit-winget-pr.js
 * 
 * Lightweight, zero-dependency submitter for Windows Package Manager (WinGet).
 * Submits validated manifests directly to microsoft/winget-pkgs via the GitHub REST API.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const token = process.env.WINGET_TOKEN;
if (!token) {
  console.error('❌ ERROR: WINGET_TOKEN secret is not set.');
  console.error('Please configure a GitHub Personal Access Token (classic with public_repo scope) in Repository Secrets.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function githubRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com${endpoint}`);
    const req = https.request(url, {
      method,
      headers: {
        'User-Agent': 'Ledgerly-WinGet-Submitter',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ statusCode: res.statusCode, data: parsed, endpoint });
          }
        } catch (e) {
          reject({ statusCode: res.statusCode, raw: data, error: e, endpoint });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('🚀 Starting WinGet Manifest Submission via GitHub API...\n');

  // 1. Identify authenticated user
  console.log('👤 Resolving authenticated user...');
  const user = await githubRequest('GET', '/user');
  const username = user.login;
  console.log(`✅ Authenticated as: ${username}\n`);

  // 2. Ensure fork of microsoft/winget-pkgs exists
  console.log(`🔍 Checking for ${username}/winget-pkgs fork...`);
  let forkReady = false;
  let attempts = 0;

  while (!forkReady && attempts < 10) {
    try {
      const fork = await githubRequest('GET', `/repos/${username}/winget-pkgs`);
      console.log(`✅ Existing fork detected: ${fork.full_name}\n`);
      forkReady = true;
    } catch (err) {
      if (err.statusCode === 404) {
        attempts++;
        if (attempts === 1) {
          console.log('⚡ Fork not found. Creating fork of microsoft/winget-pkgs via API...');
          await githubRequest('POST', '/repos/microsoft/winget-pkgs/forks');
        }
        console.log(`⏳ Waiting for fork to finish provisioning (attempt ${attempts}/10)...`);
        await sleep(6000);
      } else {
        throw err;
      }
    }
  }

  // 3. Get latest master commit SHA from upstream microsoft/winget-pkgs
  console.log('📥 Fetching latest master commit SHA from microsoft/winget-pkgs...');
  const upstreamMaster = await githubRequest('GET', '/repos/microsoft/winget-pkgs/git/ref/heads/master');
  const baseSha = upstreamMaster.object.sha;
  console.log(`✅ Base SHA: ${baseSha}\n`);

  // 4. Create or reset submission branch
  const branchName = 'AugustyaB.Ledgerly-1.0.0';
  console.log(`🌿 Preparing branch: ${branchName} on ${username}/winget-pkgs...`);
  try {
    await githubRequest('POST', `/repos/${username}/winget-pkgs/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    });
    console.log(`✅ Branch ${branchName} created.`);
  } catch (err) {
    if (err.statusCode === 422) {
      console.log(`ℹ️ Branch ${branchName} already exists, updating to latest upstream master...`);
      await githubRequest('PATCH', `/repos/${username}/winget-pkgs/git/refs/heads/${branchName}`, {
        sha: baseSha,
        force: true
      });
      console.log(`✅ Branch ${branchName} updated to base SHA.`);
    } else if (err.statusCode === 403) {
      console.error('\n❌ PERMISSION ERROR (HTTP 403): Personal Access Token cannot write to your fork.');
      console.error('---------------------------------------------------------------------------------');
      console.error('GitHub returned: "Resource not accessible by personal access token"');
      console.error('\n👉 Root Cause: You are likely using a "Fine-grained Token" that does not have write access to AugustyaB/winget-pkgs.');
      console.error('\n👉 How to Fix in 1 Minute:');
      console.error('1. Go to: GitHub Settings -> Developer settings -> Personal access tokens -> Tokens (classic).');
      console.error('2. Generate a token with the "public_repo" scope selected.');
      console.error('3. Update your repository secret WINGET_TOKEN with this classic token.');
      console.error('---------------------------------------------------------------------------------\n');
      throw err;
    } else {
      throw err;
    }
  }

  // 5. Read local manifest files
  const manifestDir = path.join(__dirname, '..', 'winget-manifests', 'manifests', 'a', 'AugustyaB', 'Ledgerly', '1.0.0');
  const manifestFiles = [
    'AugustyaB.Ledgerly.yaml',
    'AugustyaB.Ledgerly.installer.yaml',
    'AugustyaB.Ledgerly.locale.en-US.yaml'
  ];

  console.log('\n📄 Committing manifest files to branch:');
  for (const fileName of manifestFiles) {
    const filePath = path.join(manifestDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing expected manifest file: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const base64Content = Buffer.from(content).toString('base64');
    const repoPath = `manifests/a/AugustyaB/Ledgerly/1.0.0/${fileName}`;

    // Check if file already exists in branch to get its sha (required for update)
    let fileSha = null;
    try {
      const existing = await githubRequest('GET', `/repos/${username}/winget-pkgs/contents/${repoPath}?ref=${branchName}`);
      fileSha = existing.sha;
    } catch (e) {
      // File does not exist yet
    }

    const payload = {
      message: `Add ${fileName} for AugustyaB.Ledgerly version 1.0.0`,
      content: base64Content,
      branch: branchName
    };
    if (fileSha) payload.sha = fileSha;

    await githubRequest('PUT', `/repos/${username}/winget-pkgs/contents/${repoPath}`, payload);
    console.log(`  ✓ Committed: ${repoPath}`);
  }

  // 6. Create Pull Request on microsoft/winget-pkgs
  console.log('\n🚀 Opening Pull Request to microsoft/winget-pkgs:master...');
  const prTitle = 'New package: AugustyaB.Ledgerly version 1.0.0';
  const prBody = `### Pull Request Checklist
- [x] The manifest complies with the [Manifest Specification](https://github.com/microsoft/winget-pkgs/blob/master/doc/Manifest-Specification-v1.9.md).
- [x] The installer installs and uninstalls cleanly.
- [x] Tested with \`winget validate\` locally.
- [x] Package identifier format matches \`<Publisher>.<Package>\`.

**Package Identifier:** \`AugustyaB.Ledgerly\`
**Version:** \`1.0.0\`
**Publisher:** \`AugustyaB\`
**Application Name:** \`Ledgerly\`
**License:** \`MIT\`
**Installer Type:** \`nullsoft\` (NSIS)
**Installer URL:** https://github.com/AugustyaB/Ledgerly/releases/download/v1.0.0/Ledgerly.Setup.1.0.0.exe
`;

  try {
    const pr = await githubRequest('POST', '/repos/microsoft/winget-pkgs/pulls', {
      title: prTitle,
      head: `${username}:${branchName}`,
      base: 'master',
      body: prBody,
      maintainer_can_modify: true
    });
    console.log('\n🎉 SUCCESS! WinGet Pull Request successfully submitted:');
    console.log(`🔗 PR URL: ${pr.html_url}`);
    console.log(`📊 PR Number: #${pr.number}`);
  } catch (err) {
    if (err.statusCode === 422 && err.data && err.data.errors) {
      console.log('ℹ️ Pull Request already exists or is in progress:');
      console.log(JSON.stringify(err.data.errors, null, 2));
    } else {
      throw err;
    }
  }
}

main().catch(err => {
  console.error('\n❌ SUBMISSION FAILED:', err);
  process.exit(1);
});
