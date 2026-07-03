#!/usr/bin/env node



/**

 * EAS production-only hook: removes expo-dev-client before npm install so it

 * is never compiled into release APKs. Local dev and EAS development/preview

 * builds are untouched.

 *

 * Triggered via package.json → "eas-build-pre-install"

 */



const fs = require('fs');

const path = require('path');

const { execSync } = require('child_process');



const root = path.join(__dirname, '..');

const pkgPath = path.join(root, 'package.json');

const profile = process.env.EAS_BUILD_PROFILE;



const isEasProduction = process.env.EAS_BUILD === 'true' && profile === 'production';

const isLocalRelease = process.env.STRIP_DEV_CLIENT === 'true';



if (!isEasProduction && !isLocalRelease) {

  process.exit(0);

}



if (process.env.EAS_BUILD === 'true' && profile !== 'production') {

  console.log(`[release-build] EAS profile "${profile}" — keeping expo-dev-client`);

  process.exit(0);

}



console.log('[release-build] Production release build — stripping expo-dev-client…');



const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));



if (!pkg.dependencies?.['expo-dev-client']) {

  console.log('[release-build] expo-dev-client not in dependencies — nothing to do');

  process.exit(0);

}



delete pkg.dependencies['expo-dev-client'];

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');



// Keep package-lock in sync so EAS "npm ci" succeeds on the build worker.

try {

  execSync('npm install --package-lock-only --ignore-scripts', {

    cwd: root,

    stdio: 'inherit',

  });

  console.log('[release-build] package-lock.json updated on build worker');

} catch (error) {

  console.error('[release-build] Failed to sync package-lock.json:', error.message);

  process.exit(1);

}



console.log('[release-build] Done — release APK will be built without dev client');

