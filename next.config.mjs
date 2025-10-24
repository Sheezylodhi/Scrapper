/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals.push({
      "clone-deep": "commonjs clone-deep",
    });
    return config;
  },
};

export default nextConfig;
