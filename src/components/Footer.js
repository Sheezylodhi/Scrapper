export default function Footer() {
  return (
    <footer className="w-full bg-white text-center border-t border-gray-200 py-3 text-sm text-gray-600">

     <div className="mt-1">
      © {new Date().getFullYear()}{" "}
      <span className="font-semibold text-gray-700">FastScraperPro  All rights reserved.</span>. 
      
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
