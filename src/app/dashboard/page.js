"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import Footer from "@/components/Footer";

const COLORS = ["#16a34a", "#eab308", "#ef4444"];

export default function Overview() {
  const [overview, setOverview] = useState({
    tempCount: 0,
    permCount: 0,
    exportedCount: 0,
  });

  const [dataLine, setDataLine] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchOverview = async (fromDate = from, toDate = to) => {
    try {
      const query = new URLSearchParams();
      if (fromDate) query.append("from", fromDate);
      if (toDate) query.append("to", toDate);

      const res = await fetch(`/api/overview?${query.toString()}`);
      const json = await res.json();
      if (!json.error) {
        setOverview({
          tempCount: json.tempCount,
          permCount: json.permCount,
          exportedCount: json.exportedCount,
        });

        setDataLine([
          { name: "Mon", value: json.tempCount },
          { name: "Tue", value: Math.floor(json.tempCount * 0.8) },
          { name: "Wed", value: Math.floor(json.tempCount * 0.9) },
          { name: "Thu", value: Math.floor(json.tempCount * 1.1) },
          { name: "Fri", value: Math.floor(json.tempCount * 0.95) },
          { name: "Sat", value: Math.floor(json.tempCount * 1.2) },
          { name: "Sun", value: json.tempCount },
        ]);

        setPieData([
          { name: "Temporary Jobs", value: json.tempCount },
          { name: "Permanent Jobs", value: json.permCount },
          { name: "Exported", value: json.exportedCount },
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="overview-page"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4 }}
        className="min-h-[calc(100vh-140px)] overflow-y-auto space-y-8 bg-white rounded-2xl border border-gray-200 shadow-xl p-8 mt-[90px] mb-[70px]"
      >
        {/* Date Filter */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 p-2.5 rounded-lg shadow-sm text-sm focus:ring-2 focus:ring-gray-700 focus:border-gray-700 cursor-pointer transition-all"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 p-2.5 rounded-lg shadow-sm text-sm focus:ring-2 focus:ring-gray-700 focus:border-gray-700 cursor-pointer transition-all"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => fetchOverview()}
            className="bg-gradient-to-r from-gray-800 to-gray-700 text-white px-6 py-2.5 rounded-lg shadow-md hover:from-gray-900 hover:to-gray-800 transition-all"
          >
            Filter
          </motion.button>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: "Temporary Jobs", value: overview.tempCount },
            { title: "Permanent Jobs", value: overview.permCount },
            { title: "Exported Products", value: overview.exportedCount },
          ].map((card, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.03, y: -3 }}
              animate={{ opacity: 1 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-all"
            >
              <h3 className="text-gray-500 text-sm">{card.title}</h3>
              <p className="text-[28px] font-bold text-gray-800 mt-2">{card.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Graphs */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="col-span-2 bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all">
            <h3 className="text-gray-700 mb-3 font-semibold text-lg">
              Scrape Trends
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dataLine}>
                <Line type="monotone" dataKey="value" stroke="#6b7280" strokeWidth={3} />
                <Tooltip />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 flex flex-col items-center hover:shadow-lg transition-all">
            <h3 className="text-gray-700 mb-3 font-semibold text-lg">Job Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={80} label>
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
