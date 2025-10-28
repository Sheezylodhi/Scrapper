"use client";
import { Menu } from "lucide-react";

export default function Topbar({ setMobileMenu }) {
  return (
    <div className="flex items-center justify-between h-[70px] px-4 sm:px-6">
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileMenu(true)}
        className="lg:hidden p-2 rounded-md hover:bg-gray-100"
      >
        <Menu size={24} />
      </button>

      <h1 className="text-lg font-semibold">Dashboard</h1>

      {/* Example right section */}
      <div className="flex items-center gap-3">
        <img
          src="/user.png"
          alt="user"
          className="w-8 h-8 rounded-full border"
        />
      </div>
    </div>
  );
}
