"use client";

import { useRouter, usePathname } from "next/navigation";
import { BarChart3, FolderPlus, Eye, LogOut, Menu } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function Sidebar({ closeMenu }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Detect screen width
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const menu = [
    { name: "Overview", icon: BarChart3, path: "/dashboard" },
    { name: "New Job", icon: FolderPlus, path: "/dashboard/new-jobs" },
    { name: "View Jobs", icon: Eye, path: "/dashboard/view-jobs" },
  ];

  return (
    <>
      {/* MOBILE MENU BUTTON */}
      {!isDesktop && (
        <button
          onClick={() => setOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-[100] bg-gray-800 text-white p-2 rounded-md shadow-md"
        >
          <Menu size={22} />
        </button>
      )}

      {/* BACKDROP for mobile */}
      {open && !isDesktop && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]"
        ></div>
      )}

      {/* SIDEBAR */}
      <motion.aside
        initial={false}
        animate={{ x: !isDesktop && !open ? -300 : 0 }}
        transition={{ type: "spring", stiffness: 70 }}
        className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 text-gray-800 flex flex-col justify-between shadow-md z-[100]"
      >
        <div>
          <div className="p-6 text-2xl font-bold tracking-tight text-gray-900">
            Scraper
          </div>
          <nav className="mt-4 flex flex-col gap-1">
            {menu.map((item) => {
              const Icon = item.icon;
              const active = path === item.path;
              return (
                <motion.button
                  key={item.name}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    router.push(item.path);
                    setOpen(false);
                    if (closeMenu) closeMenu();
                  }}
                  className={`flex items-center gap-3 px-6 py-3 rounded-lg text-[15px] font-medium transition-all duration-300 ${
                    active
                      ? "bg-gray-100 text-gray-900 shadow-inner"
                      : "hover:bg-gray-50 text-gray-600"
                  }`}
                >
                  <Icon size={18} />
                  {item.name}
                </motion.button>
              );
            })}
          </nav>
        </div>

        <div className="p-6 border-t border-gray-100">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              localStorage.removeItem("token");
              router.push("/login");
            }}
            className="flex items-center gap-2 justify-center bg-gray-100 hover:bg-gray-200 w-full py-3 rounded-lg text-[15px] font-semibold text-gray-700 transition-all duration-200"
          >
            <LogOut size={18} /> Logout
          </motion.button>
        </div>
      </motion.aside>
    </>
  );
}
