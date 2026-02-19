const fs = require('fs');
const path = require('path');

// Create dist directory
fs.mkdirSync('dist', { recursive: true });

// Copy Angular renderer
console.log('📦 Copying Angular renderer...');
const src = 'src/renderer/dist/ksef-renderer';
const dst = 'dist/renderer';
if (fs.existsSync(src)) {
  fs.cpSync(src, dst, { recursive: true, force: true });
} else {
  fs.cpSync('src/renderer/dist', dst, { recursive: true, force: true });
}

// Setup backend
console.log('📦 Setting up backend...');
if (fs.existsSync('dist/backend')) {
  fs.rmSync('dist/backend', { recursive: true, force: true });
}
fs.mkdirSync('dist/backend', { recursive: true });

// Build backend with tsc (webpack too complex for cheerio deps)
console.log('📦 Building backend TypeScript...');
const { execSync } = require('child_process');
try {
  execSync('cd src/backend && npm run build:tsc', { stdio: 'inherit' });
  console.log('✅ Backend compiled');
} catch (err) {
  console.error('❌ Backend build failed:', err.message);
  process.exit(1);
}

// Copy compiled backend
if (fs.existsSync('src/backend/dist')) {
  fs.cpSync('src/backend/dist', 'dist/backend/dist', { recursive: true, force: true });
  console.log('✅ Compiled backend copied');
} else {
  console.error('❌ Backend dist folder not found');
  process.exit(1);
}

// Copy backend package.json
if (fs.existsSync('src/backend/package.json')) {
  fs.copyFileSync('src/backend/package.json', 'dist/backend/package.json');
  console.log('✅ Backend package.json copied');
}

// Copy database if exists
if (fs.existsSync('src/backend/ksef.db')) {
  fs.copyFileSync('src/backend/ksef.db', 'dist/backend/ksef.db');
  console.log('✅ Database file copied');
}

// Copy ALL node_modules (including all dependencies)
console.log('📦 Copying all backend dependencies (this may take a moment)...');
if (fs.existsSync('src/backend/node_modules')) {
  fs.cpSync('src/backend/node_modules', 'dist/backend/node_modules', { recursive: true, force: true });
  console.log('✅ All dependencies copied');
} else {
  console.error('❌ Backend node_modules not found');
  console.error('Run: cd src/backend && npm install');
  process.exit(1);
}

console.log('✅ All files packaged successfully!');
