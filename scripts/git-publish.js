const { execSync } = require('child_process');

console.log('\n--- SyncWaveApp Deployment Check & Publish ---');

try {
  console.log('\n[1/3] Running TypeScript Checks...');
  execSync('npx tsc --noEmit', { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' } });
  console.log('✅ TypeScript checks passed.');

  console.log('\n[2/3] Building for Vercel...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build successful. Ready for deployment.');

  console.log('\n[3/3] Publishing to Git...');
  
  // Check if there are changes to commit
  const status = execSync('git status --porcelain').toString();
  if (status.trim() === '') {
    console.log('✅ Working tree is clean. Nothing to commit.');
  } else {
    execSync('git add .', { stdio: 'inherit' });
    const commitMessage = process.argv[2] || 'Automated feature release and improvements';
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log('✅ Successfully published to git (origin/main).');
  }

  console.log('\n🎉 All checks passed. Features published successfully.\n');

} catch (error) {
  console.error('\n❌ ERROR: Deployment check failed!');
  console.error('Please fix the errors above before publishing.');
  process.exit(1);
}
