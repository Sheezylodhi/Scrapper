export default function Topbar() {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <header className="fixed top-0 left-64 right-0 z-50 bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200 p-5 flex justify-between items-center">
      <h2 className="text-[22px] font-semibold text-gray-800 tracking-tight">
           Welcome To The Dashboard 
      </h2>
      <span className="text-sm text-gray-500">{date}</span>
    </header>
  );
}
