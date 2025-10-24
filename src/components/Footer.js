export default function Footer() {
  return (
    <footer className="mt-10 border-t border-gray-200 bg-white h-[50px] flex flex-col justify-center text-center text-sm text-gray-500">
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
