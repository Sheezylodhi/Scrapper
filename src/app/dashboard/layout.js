"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import "@/app/globals.css";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.push("/login");
  }, [router]);

  return (
    <div className="flex bg-gray-100 font-[Inter] min-h-screen">
      {/* SIDEBAR */}
      <div
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-white shadow-lg transform transition-transform duration-300
        ${mobileMenu ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      >
        <Sidebar closeMenu={() => setMobileMenu(false)} />
      </div>

      {/* OVERLAY for MOBILE */}
      {mobileMenu && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileMenu(false)}
        ></div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-col flex-1 min-h-screen lg:ml-64 transition-all duration-300">
        {/* TOPBAR */}
        <div className="fixed top-0 left-0 lg:left-64 right-0 z-30 bg-white shadow-sm">
          <Topbar setMobileMenu={setMobileMenu} />
        </div>

        {/* MAIN CONTENT */}
        <main className="flex-1 mt-[70px] mb-[60px] px-4 sm:px-6 overflow-y-auto">
          {children}
        </main>

        {/* FOOTER */}
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white shadow-inner z-20">
          <Footer />
        </div>
      </div>
    </div>
  );
}
