export default function Footer() {
  return (
    <footer className="mt-10 border-t border-gray-200 bg-white py-4 text-center text-sm text-gray-500">
      © {new Date().getFullYear()}{" "}
      <span className="font-semibold text-gray-700">FastScraperPro</span>. All rights reserved.
      <div className="mt-1">
        Developed by{" "}
        <a
          href="https://nestologies.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          Nestologies
        </a>
      </div>
    </footer>
  );
}
