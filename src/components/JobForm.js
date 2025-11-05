"use client";
import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Modal from "react-modal";
import { motion, AnimatePresence } from "framer-motion";

const SITES = [
  { name: "Please select site", url: "" },
  { name: "eBay", url: "https://www.ebay.com/sch/i.html?_fsrp=1&_from=R40&For%2520Sale%2520By=Private%2520Seller&_nkw=cars+trucks&_sacat=6001&_dcat=6001&_sop=10&_fcid=1" },
  { name: "Hemming", url: "https://www.hemmings.com/classifieds/cars-for-sale?adtype=cars-for-sale&seller_type[]=private_seller&q=cars&per_page=30&sort_by=relevant_date&order=DESC&members_preview=true" },
  { name: "Craigslist (Chicago)", url: "https://chicago.craigslist.org/search/cta?purveyor=owner" },
  { name: "Craigslist (NewYork)", url: "https://newyork.craigslist.org/search/cta?purveyor=owner" },
    { name: "eBay (UK)", url: "https://www.ebay.com/sch/i.html?_oaa=1&_dcat=6001&_fsrp=1&rt=nc&_from=R40&_nkw=cars+trucks&_sacat=6001&_fcid=3&For%2520Sale%2520By=Private%2520Seller" },
     { name: "eBay (Aus)", url: "https://www.ebay.com/sch/i.html?_oaa=1&_dcat=6001&_fsrp=1&rt=nc&_from=R40&_nkw=cars+trucks&_sacat=6001&_fcid=3&For%2520Sale%2520By=Private%2520Seller" },

];

export default function Home() {
  const [selectedSite, setSelectedSite] = useState(SITES[0].name);
  const [searchUrl, setSearchUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [fromDateTime, setFromDateTime] = useState(null);
  const [toDateTime, setToDateTime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [pageIndex, setPageIndex] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filterHasContact, setFilterHasContact] = useState(false);

  const perPage = 10;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const nextEl = document.getElementById("__next");
      if (nextEl) Modal.setAppElement(nextEl);
      else Modal.setAppElement("body");
    }
  }, []);

  const handleSiteChange = (e) => {
    const site = SITES.find((s) => s.name === e.target.value);
    setSelectedSite(site.name);
    setSearchUrl(site.url);
  };

  const handleScrape = async () => {
    setLoading(true);
    setData([]);
    setPageIndex(1);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchUrl,
          maxPages,
          keyword,
          fromDate: fromDateTime ? fromDateTime.toISOString() : null,
          toDate: toDateTime ? toDateTime.toISOString() : null,
          siteName: selectedSite,

        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error || "Scrape failed");
      setData(json.results || []);
    } catch (err) {
      console.error("Scrape failed:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = (exportData = data, filename = "scraped_data.xlsx") => {
    if (!exportData || exportData.length === 0) return;
    const excelData = exportData.map((item, index) => ({
      "#": index + 1,
      Title: item.title,
      Price: item.price,
      Seller: item.sellerName,
      Email: item.sellerEmail,
      Contact: item.sellerContact,
      Posted: item.postedDate || (item.scrapedAt ? new Date(item.scrapedAt).toLocaleString() : ""),
      ProductLink: item.productLink,
      SellerProfile: item.sellerProfile || "",
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ScrapedData");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), filename);
  };

  const filteredData = filterHasContact
    ? data.filter((item) => item.sellerEmail || item.sellerContact)
    : data;

  const totalPages = Math.max(1, Math.ceil(filteredData.length / perPage));
  const current = filteredData.slice((pageIndex - 1) * perPage, pageIndex * perPage);

  const openModal = (item) => { setSelectedItem(item); setModalOpen(true); };
  const closeModal = () => { setSelectedItem(null); setModalOpen(false); };

  return (
    <div className="p-4 md:p-6 min-h-screen bg-white font-[Inter] text-gray-700">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Scraper</h1>

      {/* Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">Select site to scrape</label>
          <select
            className="w-full border border-gray-300 p-2 rounded-lg bg-white"
            value={selectedSite}
            onChange={handleSiteChange}
          >
            {SITES.map((site) => (
              <option key={site.name} value={site.name}>{site.name}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 md:col-span-2">
          <label className="block text-sm font-medium text-gray-500 mb-1">URL</label>
          <input
            className="w-full border border-gray-300 p-2.5 rounded-lg"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2 md:col-span-4">
          <label className="block text-sm font-medium text-gray-500 mb-1">Keyword (Brand / Model)</label>
          <input
            placeholder="e.g. Honda Civic"
            className="w-full border border-gray-300 p-2.5 rounded-lg"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div className="sm:col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-500 mb-1">From Date & Time</label>
          <DatePicker
            selected={fromDateTime}
            onChange={(date) => setFromDateTime(date)}
            className="w-full border border-gray-300 p-2.5 rounded-lg"
            placeholderText="Select start date & time"
            showTimeSelect
            timeFormat="HH:mm"
            timeIntervals={15}
            dateFormat="yyyy-MM-dd HH:mm"
          />
        </div>

        <div className="sm:col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-500 mb-1">To Date & Time</label>
          <DatePicker
            selected={toDateTime}
            onChange={(date) => setToDateTime(date)}
            className="w-full border border-gray-300 p-2.5 rounded-lg"
            placeholderText="Select end date & time"
            showTimeSelect
            timeFormat="HH:mm"
            timeIntervals={15}
            dateFormat="yyyy-MM-dd HH:mm"
          />
        </div>

        <div className="sm:col-span-2 md:col-span-4 flex flex-col sm:flex-row gap-2 justify-end mt-2">
          <button
            onClick={handleScrape}
            disabled={loading}
            className={`px-6 py-2 rounded-lg text-white font-medium ${loading ? "bg-gray-400" : "bg-black hover:bg-gray-900"}`}
          >
            {loading ? "Scraping..." : "Start Scraping"}
          </button>

          <button
            onClick={() => exportToExcel()}
            className="px-6 py-2 rounded-lg text-white font-medium bg-green-600 hover:bg-green-700"
          >
            Export All to Excel
          </button>
        </div>
      </div>

      {/* Results Table + Filter */}
      {loading ? (
        <div className="mt-10 text-lg text-gray-500">⏳ Scraping... please wait.</div>
      ) : filteredData.length === 0 ? (
        <div className="mt-10 text-gray-400">No results yet. Enter URL, keyword, and date/time filter.</div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2 sm:gap-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1 border rounded cursor-pointer bg-gray-100 flex items-center gap-1">
                <span>Sort: Best Match</span>
                <svg className="icon w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.939l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0l-4.24-4.24a.75.75 0 01.02-1.06z"/>
                </svg>
              </span>

              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={filterHasContact ? "contact" : "all"}
                onChange={(e) => setFilterHasContact(e.target.value === "contact")}
              >
                <option value="all">All Rows</option>
                <option value="contact">Only Email/Contact</option>
              </select>
            </div>
            <div className="mt-2 sm:mt-0">Showing {filteredData.length} results</div>
          </div>

          <div className="overflow-x-auto bg-white rounded-xl shadow border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-2 sm:p-3 text-left">#</th>
                  <th className="p-2 sm:p-3">Image</th>
                  <th className="p-2 sm:p-3 text-left">Title</th>
                  <th className="p-2 sm:p-3 text-center">Price</th>
                  <th className="p-2 sm:p-3 text-center">Seller</th>
                  <th className="p-2 sm:p-3 text-center">Email</th>
                  <th className="p-2 sm:p-3 text-center">Contact</th>
                  <th className="p-2 sm:p-3 text-center">Posted</th>
                  <th className="p-2 sm:p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((it, i) => (
                  <tr key={it.productLink + i} className="border-t hover:bg-gray-50 transition">
                    <td className="p-2 sm:p-3 text-center">{(pageIndex - 1) * perPage + i + 1}</td>
                    <td className="p-2 sm:p-3 text-center">
                      <img src={it.image || "/no-image.png"} alt="" className="w-20 sm:w-24 h-12 sm:h-16 object-cover rounded border" />
                    </td>
                    <td className="p-2 sm:p-3 max-w-xs">{it.title}</td>
                    <td className="p-2 sm:p-3 text-center">{it.price || "—"}</td>
                    <td className="p-2 sm:p-3 text-center">{it.sellerName || "—"}</td>
                    <td className="p-2 sm:p-3 text-center text-blue-700">{it.sellerEmail || "—"}</td>
                    <td className="p-2 sm:p-3 text-center">{it.sellerContact || "—"}</td>
                    <td className="p-2 sm:p-3 text-center font-medium">{it.postedDate || (it.scrapedAt ? new Date(it.scrapedAt).toLocaleString() : "—")}</td>
                    <td className="p-2 sm:p-3 text-center">
                      <button onClick={() => openModal(it)} className="text-blue-600 underline text-sm sm:text-base">View Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row justify-between items-center mt-5 gap-2 sm:gap-0">
            <button disabled={pageIndex <= 1} onClick={() => setPageIndex((p) => Math.max(1, p - 1))} className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">Prev</button>
            <span>Page {pageIndex} / {totalPages}</span>
            <button disabled={pageIndex >= totalPages} onClick={() => setPageIndex((p) => Math.min(totalPages, p + 1))} className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">Next</button>
          </div>
        </>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && selectedItem && (
          <Modal
            isOpen={modalOpen}
            onRequestClose={closeModal}
            className="outline-none"
            overlayClassName="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          >
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.25 }} className="bg-white font-[Inter] rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">{selectedItem.title}</h2>
              <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                <div className="flex-shrink-0">
                  <img src={selectedItem.image || "/no-image.png"} alt="" className="w-full sm:w-64 h-40 object-cover rounded border shadow-sm" />
                </div>
                <div className="flex-1 space-y-2 text-sm sm:text-base">
                  <p><strong>Price:</strong> {selectedItem.price || "—"}</p>
                  <p><strong>Seller:</strong> {selectedItem.sellerName || "—"}</p>
                  <p><strong>Email:</strong> {selectedItem.sellerEmail || "—"}</p>
                  <p><strong>Contact:</strong> {selectedItem.sellerContact || "—"}</p>
                  <p><strong>Posted:</strong> {selectedItem.postedDate || (selectedItem.scrapedAt ? new Date(selectedItem.scrapedAt).toLocaleString() : "—")}</p>
                  <p><strong>Product Link:</strong> <a href={selectedItem.productLink} target="_blank" className="text-blue-600 underline break-all">{selectedItem.productLink}</a></p>
                  {selectedItem.sellerProfile && <p><strong>Seller Profile:</strong> <a href={selectedItem.sellerProfile} target="_blank" className="text-green-600 underline break-all">{selectedItem.sellerProfile}</a></p>}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row justify-between mt-4 sm:mt-6 gap-2">
                <button onClick={closeModal} className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded w-full sm:w-auto">Close</button>
                <button onClick={() => exportToExcel([selectedItem], "product_details.xlsx")} className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded w-full sm:w-auto">Export This Product to Excel</button>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}