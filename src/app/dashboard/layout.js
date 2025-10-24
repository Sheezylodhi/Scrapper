"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import "@/app/globals.css";

export default function DashboardLayout({ children }) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.push("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-100 font-[Inter]">
      <Sidebar />
      <Topbar />
      <div className="flex flex-col min-h-screen pl-64 pt-[80px] pb-[60px]"> 
        {/* pl-64 shifts content right = sidebar width */}
        <main className="flex-1 overflow-y-auto px-8">{children}</main>
      </div>
      {/* Footer Fixed */}
      <div className="fixed bottom-0 left-64 right-0 z-40">
        <Footer />
      </div>
    </div>
  );
}
