/** @type {import('next').NextConfig} */
const nextConfig = {
  // A verification build must not share `.next` with a running `next dev`:
  // whichever writes second leaves the other serving chunk filenames that no
  // longer exist, which shows up as every `/_next/static/...` request 404ing
  // and looks like the app is broken. Build elsewhere instead:
  //
  //   NEXT_DIST_DIR=.next-check npm run build
  //
  // Unset, everything behaves exactly as before.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
