"use client";

import { motion } from "framer-motion";
import JobForm from "@/components/JobForm";

export default function NewJobPage() {
  return (
    <motion.div
      key="new-job"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 min-h-[calc(100vh-160px)]"
    >
      <h1 className="text-[26px] font-bold text-gray-800 mb-8 text-center">
        New Job Add & Scrape
      </h1>
      <JobForm />
    </motion.div>
  );
}
