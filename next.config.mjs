function publicHost(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const cosHosts = [
  publicHost(process.env.NEXT_PUBLIC_COS_INSPECTION_PHOTOS_BASE_URL),
  publicHost(process.env.NEXT_PUBLIC_COS_ORDER_ATTACHMENTS_BASE_URL)
].filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.2.84"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co"
      },
      {
        protocol: "https",
        hostname: "**.myqcloud.com"
      },
      ...cosHosts.map((hostname) => ({ protocol: "https", hostname }))
    ]
  }
};

export default nextConfig;
