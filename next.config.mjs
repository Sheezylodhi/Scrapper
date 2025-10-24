/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Ignore .map files inside chrome-aws-lambda
    config.module.rules.push({
      test: /\.map$/,
      use: 'ignore-loader'
    });

    return config;
  },
};

export default nextConfig;
