"use client";

import { useRouter, usePathname } from "next/navigation";
import { BarChart3, FolderPlus, Eye, LogOut } from "lucide-react";
import { motion } from "framer-motion";

export default function Sidebar() {
  const router = useRouter();
  const path = usePathname();

  const menu = [
    { name: "Overview", icon: BarChart3, path: "/dashboard" },
    { name: "New Job", icon: FolderPlus, path: "/dashboard/new-jobs" },
    { name: "View Jobs", icon: Eye, path: "/dashboard/view-jobs" },
  ];

  return (
    <motion.aside
      initial={{ x: -80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 70 }}
      className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 text-gray-800 flex flex-col justify-between shadow-md z-50"
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
                onClick={() => router.push(item.path)}
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
  );
}
