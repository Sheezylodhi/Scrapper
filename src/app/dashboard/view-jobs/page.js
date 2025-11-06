// src/app/dashboard/view-jobs/page.js  (or wherever your component lives)
"use client";

import { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Modal from "react-modal";
import { AnimatePresence, motion } from "framer-motion";

export default function ViewJobs() {
  const [data, setData] = useState([]); // raw data from current mode (temporary OR permanent)
  const [filtered, setFiltered] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(1);
  const perPage = 10;
  const [viewMode, setViewMode] = useState("temporary"); // temporary | permanent
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // keep set of already-saved productLinks (permanent)
  const [permanentLinks, setPermanentLinks] = useState(new Set());

  // Fix App Router modal issue
  useEffect(() => {
    if (typeof window !== "undefined") {
      Modal.setAppElement(document.body);
    }
  }, []);

  // fetch permanent links separately to mark saved rows
  const fetchPermanentLinks = async () => {
    try {
      const res = await fetch("/api/permanent");
      const json = await res.json();
      const links = (json.results || []).map((r) => r.productLink).filter(Boolean);
      setPermanentLinks(new Set(links));
    } catch (err) {
      console.error("Failed to fetch permanent links", err);
    }
  };

  // --- Fetch Data ---
  const fetchData = async () => {
    setLoading(true);
    try {
      // always refresh permanent links too (keeps UI in sync)
      await fetchPermanentLinks();

      const res = await fetch(viewMode === "temporary" ? "/api/listing" : "/api/permanent");
      const json = await res.json();
      const items = (json.results || []).map((it) => ({
        ...it,
        // mark _saved if its productLink exists in permanentLinks
        _saved: permanentLinks.has(it.productLink),
      }));
      setData(items);
      setFiltered(items);
      setPageIndex(1);
    } catch (err) {
      console.error(err);
      alert("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // When viewMode or permanentLinks change, refresh data so _saved flags update
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // ensure permanent links are fresh once at mount
  useEffect(() => {
    fetchPermanentLinks();
  }, []);

  // --- Filter ---
  const handleFilter = () => {
    let filteredData = [...data];

    if (keyword.trim()) {
      filteredData = filteredData.filter((d) =>
        (d.title || "").toLowerCase().includes(keyword.toLowerCase())
      );
    }

    if (from) {
      filteredData = filteredData.filter((d) => new Date(d.scrapedAt) >= from);
    }

    if (to) {
      filteredData = filteredData.filter((d) => new Date(d.scrapedAt) <= to);
    }

    // set saved flag from permanentLinks to keep UI consistent
    filteredData = filteredData.map((it) => ({ ...it, _saved: permanentLinks.has(it.productLink) }));

    setFiltered(filteredData);
    setPageIndex(1);
  };

  // --- Delete single ---
  const handleDelete = async (id) => {
    if (!confirm("Delete this record?")) return;
    try {
      await fetch(viewMode === "temporary" ? `/api/listing/${id}` : `/api/permanent/${id}`, { method: "DELETE" });
      setData((prev) => prev.filter((d) => d._id !== id));
      setFiltered((prev) => prev.filter((d) => d._id !== id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete");
    }
  };

  // --- Delete All / Delete Filtered (bulk client-side delete by id) ---
  const handleDeleteBulk = async ({ onlyFiltered = false } = {}) => {
    const itemsToDelete = onlyFiltered ? filtered : data;
    if (!itemsToDelete || itemsToDelete.length === 0) {
      return alert("No records found to delete.");
    }

    const modeLabel = viewMode === "temporary" ? "temporary" : "permanent";
    const count = itemsToDelete.length;
    const confirmMsg = onlyFiltered
      ? `Delete ${count} visible (filtered) record(s) from ${modeLabel}? This cannot be undone.`
      : `Delete ALL ${count} record(s) from ${modeLabel}? This cannot be undone.`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      // Delete each by id (backend currently supports /api/listing/:id and /api/permanent/:id)
      const endpointBase = viewMode === "temporary" ? "/api/listing" : "/api/permanent";

      // Collect ids (filter out missing ids)
      const ids = itemsToDelete.map((it) => it._id).filter(Boolean);
      // Fire deletions in parallel
      await Promise.all(
        ids.map((id) =>
          fetch(`${endpointBase}/${id}`, {
            method: "DELETE",
          }).catch((e) => {
            console.error("delete error for id", id, e);
            // swallow per-item error to continue others
          })
        )
      );

      // Update UI to remove deleted items
      if (onlyFiltered) {
        // remove filtered items from both data and filtered
        const idSet = new Set(ids);
        setData((prev) => prev.filter((d) => !idSet.has(d._id)));
        setFiltered((prev) => prev.filter((d) => !idSet.has(d._id)));
      } else {
        // deleted all in this mode -> clear arrays
        setData([]);
        setFiltered([]);
      }

      alert(`Deleted ${ids.length} record(s).`);
      // refresh permanent links if needed
      await fetchPermanentLinks();
    } catch (err) {
      console.error(err);
      alert("Failed to delete records.");
    } finally {
      setLoading(false);
    }
  };

  // --- Save temporary to permanent single item ---
  const handleSavePermanent = async (item) => {
    if (!item || !item.productLink) return alert("Invalid item (missing product link).");
    if (permanentLinks.has(item.productLink)) return alert("This item is already saved permanently.");

    try {
      const res = await fetch("/api/permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const json = await res.json();
      if (json.exists) {
        // server says exists
        setPermanentLinks((prev) => new Set(prev).add(item.productLink));
        // update UI flags
        setData((prev) => prev.map((d) => (d.productLink === item.productLink ? { ...d, _saved: true } : d)));
        setFiltered((prev) => prev.map((d) => (d.productLink === item.productLink ? { ...d, _saved: true } : d)));
        return alert("Data already saved permanently!");
      }
      if (json.success || json.data) {
        setPermanentLinks((prev) => new Set(prev).add(item.productLink));
        setData((prev) => prev.map((d) => (d.productLink === item.productLink ? { ...d, _saved: true } : d)));
        setFiltered((prev) => prev.map((d) => (d.productLink === item.productLink ? { ...d, _saved: true } : d)));
        return alert("Saved permanently!");
      }
      alert("Save response unknown from server.");
    } catch (err) {
      console.error(err);
      alert("Failed to save permanently");
    }
  };

  // --- Save filtered temporary data to permanent (bulk) ---
  const handleSaveAllFiltered = async () => {
    if (filtered.length === 0) return alert("No filtered data to save!");

    // only keep items with productLink and that are not already saved
    const filteredWithLink = filtered.filter((d) => d.productLink && !permanentLinks.has(d.productLink));
    if (filteredWithLink.length === 0) return alert("No new items to save (all already permanent or missing productLink).");

    // Prepare payload (you can send full objects or minimal fields)
    const payload = filteredWithLink.map((d) => ({
      title: d.title,
      price: d.price,
      sellerName: d.sellerName,
      sellerEmail: d.sellerEmail,
      sellerContact: d.sellerContact,
      productLink: d.productLink,
      sellerProfile: d.sellerProfile,
      scrapedAt: d.scrapedAt,
      image: d.image || "",
    }));

    setLoading(true);
    try {
      const res = await fetch("/api/permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      // backend returns { savedCount: N } per your API
      const savedCount = json.savedCount ?? 0;

      // add the newly-sent links to permanentLinks set (we assume backend saved them except duplicates)
      const newLinks = payload.map((p) => p.productLink);
      setPermanentLinks((prev) => {
        const s = new Set(prev);
        newLinks.forEach((l) => s.add(l));
        return s;
      });

      // update UI flags for saved ones
      setData((prev) => prev.map((d) => (newLinks.includes(d.productLink) ? { ...d, _saved: true } : d)));
      setFiltered((prev) => prev.map((d) => (newLinks.includes(d.productLink) ? { ...d, _saved: true } : d)));

      alert(`${savedCount} item(s) saved permanently.`);
      // optionally refresh permanent list
      await fetchPermanentLinks();
    } catch (err) {
      console.error(err);
      alert("Failed to save filtered data permanently.");
    } finally {
      setLoading(false);
    }
  };

  // --- Export to Excel --- (changed: default exports current grid view page)
  // now default `exportToExcel()` will export the CURRENT visible grid (current page slice)
  const exportToExcel = (exportData = null, filename = "data.xlsx") => {
    const exportSource = exportData ?? current; // if caller passes explicit array, use it; otherwise export current page rows
    if (!exportSource || exportSource.length === 0) return alert("No data to export.");
    const excelData = exportSource.map((item, index) => ({
      "#": index + 1,
      Title: item.title,
      Price: item.price,
      Seller: item.sellerName,
      Email: item.sellerEmail,
      Contact: item.sellerContact,
      ScrapedAt: item.scrapedAt ? new Date(item.scrapedAt).toLocaleString() : "",
      ProductLink: item.productLink,
      SellerProfile: item.sellerProfile || "",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), filename);
  };

  // --- Modal ---
  const openModal = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setSelectedItem(null);
    setModalOpen(false);
  };

  // --- Refresh (clear filters & reload data) ---
  const handleRefresh = async () => {
    setKeyword("");
    setFrom(null);
    setTo(null);
    await fetchData();
  };

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = filtered.slice((pageIndex - 1) * perPage, pageIndex * perPage);

  return (
    <div className="p-6 min-h-screen bg-white font-[Inter] text-gray-700">
      <h1 className="text-3xl font-bold mb-6">
        View Jobs ({viewMode === "temporary" ? "Temporary" : "Permanent"} Data)
      </h1>

      {/* Mode toggle + filter */}
      <div className="flex flex-col md:flex-row md:items-end gap-4 mb-6">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Mode</label>
          <select
            className="border border-gray-300 p-2 rounded-lg"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="temporary">Temporary Data</option>
            <option value="permanent">Permanent Data</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-1">Keyword</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Brand / Model"
            className="w-full border border-gray-300 p-2.5 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-1">From</label>
          <DatePicker
            selected={from}
            onChange={(date) => setFrom(date)}
            className="w-full border border-gray-300 p-2.5 rounded-lg"
            showTimeSelect
            dateFormat="yyyy-MM-dd HH:mm"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-1">To</label>
          <DatePicker
            selected={to}
            onChange={(date) => setTo(date)}
            className="w-full border border-gray-300 p-2.5 rounded-lg"
            showTimeSelect
            dateFormat="yyyy-MM-dd HH:mm"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={handleFilter} className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-900">Filter</button>

          {/* Export now exports current grid page (current variable) */}
          <button onClick={() => exportToExcel()} className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Export Excel</button>

          {viewMode === "temporary" && filtered.length > 0 && (
            <button onClick={handleSaveAllFiltered} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Save All Filtered</button>
          )}

          {/* NEW: Delete buttons and Refresh */}
          <button
            onClick={() => handleDeleteBulk({ onlyFiltered: false })}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            title="Delete ALL records in current mode"
          >
            Delete All
          </button>

          <button
            onClick={() => handleDeleteBulk({ onlyFiltered: true })}
            className="bg-red-400 text-white px-4 py-2 rounded-lg hover:bg-red-500"
            title="Delete only currently filtered (visible) records"
          >
            Delete Filtered
          </button>

          <button
            onClick={handleRefresh}
            className="bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300"
            title="Clear filters & refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-gray-500">⏳ Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400">No data available</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-3 text-left">#</th>
                <th className="p-3">Image</th>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-center">Price</th>
                <th className="p-3 text-center">Seller</th>
                <th className="p-3 text-center">Email</th>
                <th className="p-3 text-center">Contact</th>
                <th className="p-3 text-center">Scraped At</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {current.map((d, i) => (
                <tr key={d._id || d.productLink || i} className="border-t hover:bg-gray-50 transition">
                  <td className="p-3 text-center">{(pageIndex - 1) * perPage + i + 1}</td>
                  <td className="p-3 text-center">
                    <img src={d.image || "/no-image.png"} className="w-24 h-16 object-cover rounded border" />
                  </td>
                  <td className="p-3 max-w-xs">{d.title}</td>
                  <td className="p-3 text-center">{d.price || "—"}</td>
                  <td className="p-3 text-center">{d.sellerName || "—"}</td>
                  <td className="p-3 text-center text-blue-700">{d.sellerEmail || "—"}</td>
                  <td className="p-3 text-center">{d.sellerContact || "—"}</td>
                  <td className="p-3 text-center">{d.scrapedAt ? new Date(d.scrapedAt).toLocaleString() : "—"}</td>
                  <td className="p-3 text-center space-x-2">
                    <button onClick={() => openModal(d)} className="text-blue-600 underline">View</button>

                    {viewMode === "temporary" && (
                      <button
                        onClick={() => handleSavePermanent(d)}
                        className={`px-2 py-1 rounded ${d._saved ? "bg-gray-300 text-gray-700 cursor-not-allowed" : "bg-green-500 text-white hover:bg-green-600"}`}
                        disabled={d._saved}
                      >
                        {d._saved ? "Saved" : "Save"}
                      </button>
                    )}

                    <button onClick={() => handleDelete(d._id)} className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-5">
            <button disabled={pageIndex <= 1} onClick={() => setPageIndex(p => Math.max(1, p-1))} className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">Prev</button>
            <span>Page {pageIndex} / {totalPages}</span>
            <button disabled={pageIndex >= totalPages} onClick={() => setPageIndex(p => Math.min(totalPages, p+1))} className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">Next</button>
          </div>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && selectedItem && (
          <Modal
            isOpen={modalOpen}
            onRequestClose={closeModal}
            className="outline-none"
            overlayClassName="fixed inset-0 bg-transparent z-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.22 }}
              className="bg-white font-[Inter] rounded-xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold mb-4">{selectedItem.title}</h2>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-shrink-0">
                  <img src={selectedItem.image || "/no-image.png"} alt="" className="w-64 h-40 object-cover rounded border shadow-sm" />
                </div>
                <div className="flex-1 space-y-2 text-sm">
                  <p><strong>Price:</strong> {selectedItem.price || "—"}</p>
                  <p><strong>Seller:</strong> {selectedItem.sellerName || "—"}</p>
                  <p><strong>Email:</strong> {selectedItem.sellerEmail || "—"}</p>
                  <p><strong>Contact:</strong> {selectedItem.sellerContact || "—"}</p>
                  <p><strong>Scraped At:</strong> {selectedItem.scrapedAt ? new Date(selectedItem.scrapedAt).toLocaleString() : "—"}</p>
                  <p><strong>Product Link:</strong> <a href={selectedItem.productLink} target="_blank" rel="noreferrer" className="text-blue-600 underline">{selectedItem.productLink}</a></p>
                  {selectedItem.sellerProfile && <p><strong>Seller Profile:</strong> <a href={selectedItem.sellerProfile} target="_blank" rel="noreferrer" className="text-green-600 underline">{selectedItem.sellerProfile}</a></p>}
                </div>
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={closeModal} className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded">Close</button>
                <div className="space-x-2">
                  {viewMode === "temporary" && (
                    <button
                      onClick={() => handleSavePermanent(selectedItem)}
                      className={`px-4 py-2 rounded ${selectedItem._saved ? "bg-gray-300 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                      disabled={selectedItem._saved}
                    >
                      {selectedItem._saved ? "Saved" : "Save Permanently"}
                    </button>
                  )}
                  <button onClick={() => exportToExcel([selectedItem], "product_details.xlsx")} className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded">Export This Product</button>
                </div>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
