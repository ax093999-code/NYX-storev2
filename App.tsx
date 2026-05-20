/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";

// Theme Colors
// Background: #F5F5F7
// Content: #1D1D1F
// Accent: #0071E3
// Borders: #E5E5E7
// Secondary Text: #86868B
// Card BG: #FFFFFF
// Green: #2E7D32 (bg #E8F5E9)

interface Product {
  id: string;
  title: string;
  price: number;
  description: string;
  stock: number;
  downloadLink?: string;
  imageUrl?: string;
  icon?: string;
}

interface Status {
  telegramConfigured: boolean;
  paymentConfigured: boolean;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<Status>({
    telegramConfigured: false,
    paymentConfigured: false,
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    lowStockThreshold: 2,
    paymentMethods: [] as string[],
    maintenanceMode: false,
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const [paymentMethodsList, setPaymentMethodsList] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<
    { id: string; message: string; type: "info" | "warning" }[]
  >([]);

  useEffect(() => {
    const sse = new EventSource("/api/events");
    sse.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
      } catch (err) {}
    };
    sse.addEventListener("new_order", (e) => {
      const data = JSON.parse(e.data);
      const id = Date.now().toString();
      setAlerts((prev) => [
        ...prev,
        {
          id,
          message: `طلب جديد من ${data.username || data.userId}`,
          type: "info",
        },
      ]);
      setTimeout(
        () => setAlerts((prev) => prev.filter((a) => a.id !== id)),
        5000,
      );
      setOrders((prev) => [data, ...prev]);
    });
    sse.addEventListener("low_stock", (e) => {
      const data = JSON.parse(e.data);
      const id = Date.now().toString();
      setAlerts((prev) => [
        ...prev,
        {
          id,
          message: `المنتج "${data.title}" أوشك على النفاد. الرصيد: ${data.stock}`,
          type: "warning",
        },
      ]);
      setTimeout(
        () => setAlerts((prev) => prev.filter((a) => a.id !== id)),
        8000,
      );
      setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p))); // Update product local state too!
    });
    sse.addEventListener("order_updated", (e) => {
      const data = JSON.parse(e.data);
      setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    });
    sse.addEventListener("user_updated", (e) => {
      const data = JSON.parse(e.data);
      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === data.id);
        if (idx !== -1) {
          const newUsers = [...prev];
          newUsers[idx] = data;
          return newUsers;
        }
        return [data, ...prev];
      });
    });

    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => setProducts(data))
      .catch(console.error);

    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(console.error);

    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => setOrders(data))
      .catch(console.error);

    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch(console.error);

    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setPaymentMethodsList(data.paymentMethods || []);
      })
      .catch(console.error);

    return () => sse.close();
  }, []);

  return (
    <div
      dir="rtl"
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#F5F5F7] text-[#1D1D1F] font-sans"
    >
      {/* Real-time Alerts */}
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2 pointer-events-none">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`pointer-events-auto flex items-center justify-between p-4 rounded-lg shadow-lg border text-sm w-72 animate-in fade-in slide-in-from-left-5 ${alert.type === "warning" ? "bg-orange-50 border-orange-200 text-orange-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}
          >
            <div className="flex items-center gap-3">
              <span>{alert.type === "warning" ? "⚠️" : "🔔"}</span>
              <span>{alert.message}</span>
            </div>
            <button
              onClick={() =>
                setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
              }
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Navigation Bar */}
      <nav className="h-16 bg-white border-b border-[#E5E5E7] flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-2 font-semibold text-[18px] text-[#0071E3]">
          <span>Nyx Store</span>
          <span className="text-[#86868B] font-normal">لوحة التحكم</span>
        </div>
        <div className="flex gap-5 items-center">
          <div
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl ${status.telegramConfigured ? "bg-[#E8F5E9] text-[#2E7D32]" : "bg-red-50 text-red-600"}`}
          >
            ● {status.telegramConfigured ? "البوت متصل" : "البوت غير متصل"}
          </div>
          <img
            src="https://res-console.cloudinary.com/dtuyxy8tp/thumbnails/transform/v1/image/upload/Y19maWxsLGhfMjAwLHdfMjAw/v1/Y2FhODViY2I2ODdkYmJmZGQ2OTFmMTkwZDhlMWJkZDJfcnlqZHRw/template_primary"
            alt="صورة الملف الشخصي"
            className="w-10 h-10 rounded-full object-cover border border-[#E5E5E7] bg-[#F5F5F7] cursor-pointer hover:opacity-80 transition-opacity shadow-sm"
            title="Nyx Store"
          />
        </div>
      </nav>

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside className="w-[220px] bg-white border-l border-[#E5E5E7] flex flex-col py-6 shrink-0">
          <NavItem
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
            icon="👑"
            label="لوحة التحكم الشاملة"
          />
          <NavItem
            active={activeTab === "products"}
            onClick={() => setActiveTab("products")}
            icon="📦"
            label="المنتجات والمخزون"
          />
          <NavItem
            active={activeTab === "orders"}
            onClick={() => setActiveTab("orders")}
            icon="🛒"
            label="تاريخ الطلبات"
          />
          <NavItem
            active={activeTab === "customers"}
            onClick={() => setActiveTab("customers")}
            icon="👥"
            label="العملاء"
          />
          <NavItem
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
            icon="⚙️"
            label="الإعدادات وطرق الدفع"
          />
        </aside>

        {/* Main Content Pane */}
        <main className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
          {activeTab === "dashboard" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-[#1D1D1F] mb-1">
                    لوحة التحكم الشاملة 👑
                  </h1>
                  <p className="text-sm text-[#86868B]">
                    أهلاً بك في مركز الإدارة. من هنا يمكنك التحكم الكامل في جميع
                    ميزات البوت.
                  </p>
                </div>
              </div>

              {/* Quick Actions / Admin Functions Control */}
              <div className="grid grid-cols-4 gap-4 mb-2">
                <button
                  onClick={() => setActiveTab("products")}
                  className="bg-white border border-[#E5E5E7] rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#F5F5F7] hover:border-[#0071E3] transition-colors cursor-pointer group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    📦
                  </span>
                  <span className="text-sm font-semibold text-[#1D1D1F]">
                    إدارة المنتجات
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("orders")}
                  className="bg-white border border-[#E5E5E7] rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#F5F5F7] hover:border-[#0071E3] transition-colors cursor-pointer group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    🛒
                  </span>
                  <span className="text-sm font-semibold text-[#1D1D1F]">
                    مراجعة الطلبات الدائمة{" "}
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      {orders.filter((o) => o.status === "pending").length || 0}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("customers")}
                  className="bg-white border border-[#E5E5E7] rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#F5F5F7] hover:border-[#0071E3] transition-colors cursor-pointer group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    👥
                  </span>
                  <span className="text-sm font-semibold text-[#1D1D1F]">
                    عملاء المتجر والبوت
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="bg-white border border-[#E5E5E7] rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#F5F5F7] hover:border-[#0071E3] transition-colors cursor-pointer group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    ⚙️
                  </span>
                  <span className="text-sm font-semibold text-[#1D1D1F]">
                    طرق الدفع والإعدادات
                  </span>
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-4">
                <StatCard
                  label="إجمالي الإيرادات"
                  value={`$${orders
                    .filter((o) => o.status === "approved")
                    .reduce(
                      (acc, o) =>
                        acc +
                        (o.type === "wallet"
                          ? o.amount || 0
                          : o.product?.price || 0),
                      0,
                    )
                    .toFixed(2)}`}
                  trend="من المبيعات والمحفظة"
                  trendColor="text-[#34C759]"
                />
                <StatCard
                  label="المستخدمين"
                  value={users.length.toString()}
                  trend="في البوت"
                  trendColor="text-[#34C759]"
                />
                <StatCard
                  label="الطلبات المعلقة"
                  value={orders
                    .filter((o) => o.status === "pending")
                    .length.toString()}
                  trend="بحاجة لمراجعة"
                  trendColor="text-[#FF9500]"
                />
                <StatCard
                  label="المنتجات النشطة"
                  value={products.filter((p) => p.stock > 0).length.toString()}
                  trend={
                    status.telegramConfigured ? "البوت متصل" : "البوت غير متصل"
                  }
                  trendColor={
                    status.telegramConfigured
                      ? "text-[#34C759]"
                      : "text-red-500"
                  }
                />
              </div>

              {/* Activity Feed */}
              <div className="flex-1 min-h-0 grid grid-cols-1 gap-6">
                <div className="bg-white rounded-2xl border border-[#E5E5E7] p-5 flex flex-col overflow-hidden">
                  <div className="text-[16px] font-semibold mb-4 text-[#1D1D1F]">
                    نشاط الطلبات الأخير
                  </div>
                  <div className="flex flex-col gap-3 overflow-y-auto text-[13px]">
                    {orders.slice(0, 10).map((o) => (
                      <ActivityEntry
                        key={o.id}
                        time={new Date(o.timestamp).toLocaleTimeString("ar-EG")}
                        text={
                          <>
                            <b>@{o.username || o.userId}</b>{" "}
                            {o.status === "approved"
                              ? `أكمل ${o.type === "wallet" ? "شحن المحفظة ($" + o.amount + ")" : "شراء " + (o.product?.title || "منتج")}`
                              : `أرسل طلب ${o.type === "wallet" ? "لشحن المحفظة ($" + o.amount + ")" : "لشراء " + (o.product?.title || "منتج")}`}
                          </>
                        }
                      />
                    ))}
                    {orders.length === 0 && (
                      <div className="text-[#86868B] text-sm mt-4 text-center">
                        لا يوجد نشاط بعد
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "products" && (
            <div className="bg-white rounded-2xl border border-[#E5E5E7] p-5 flex flex-col flex-1 min-h-0">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-[18px] font-semibold text-[#1D1D1F]">
                    إدارة المنتجات والمخزون
                  </h2>
                  <p className="text-[13px] text-[#86868B] mt-1">
                    أضف منتجات جديدة، وقم بتعديل الأسعار أو تحديث المخزون
                    بسهولة.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="bg-[#0071E3] hover:bg-[#005bb5] transition-colors text-white py-2.5 px-4 rounded-xl flex items-center gap-2 cursor-pointer font-medium shadow-sm"
                >
                  <span className="text-lg leading-none">+</span> إضافة منتج
                  جديد
                </button>
              </div>

              <div className="overflow-y-auto flex-1 border border-[#E5E5E7] rounded-xl">
                <table className="w-full text-sm text-right">
                  <thead className="bg-[#F5F5F7] text-[#86868B] sticky top-0">
                    <tr>
                      <th className="px-5 py-4 font-medium">المنتج</th>
                      <th className="px-5 py-4 font-medium">السعر</th>
                      <th className="px-5 py-4 font-medium">
                        المخزون (الحالة)
                      </th>
                      <th className="px-5 py-4 font-medium max-w-[200px]">
                        الوصف
                      </th>
                      <th className="px-5 py-4 font-medium w-24">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center py-12 text-[#86868B]"
                        >
                          لا توجد منتجات حالياً. قم بإضافة منتجك الأول لبدء
                          البيع!
                        </td>
                      </tr>
                    ) : (
                      products.map((p, i) => (
                        <tr
                          key={p.id}
                          className="border-t border-[#E5E5E7] hover:bg-[#FAFAFA] transition-colors"
                        >
                          <td className="px-5 py-4 text-[#1D1D1F] font-medium flex items-center gap-3">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.title}
                                className="w-10 h-10 object-cover rounded-lg border border-[#E5E5E7] shadow-sm"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-[#F5F5F7] rounded-lg flex items-center justify-center text-lg border border-[#E5E5E7] shadow-sm">
                                {p.icon || ["📚", "💎", "🎮", "🔑"][i % 4]}
                              </div>
                            )}
                            {p.title}
                          </td>
                          <td className="px-5 py-4 text-[#1D1D1F]">
                            ${parseFloat(String(p.price)).toFixed(2)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${p.stock > settings.lowStockThreshold ? "bg-[#34C759]" : p.stock > 0 ? "bg-[#FF9500]" : "bg-[#FF3B30]"}`}
                              ></span>
                              <span>{p.stock} نسخة</span>
                            </div>
                          </td>
                          <td
                            className="px-5 py-4 text-[#86868B] text-xs max-w-[200px] truncate"
                            title={p.description}
                          >
                            {p.description}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingProduct(p)}
                                className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors cursor-pointer"
                                title="تعديل"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={async () => {
                                  await fetch(`/api/products/${p.id}`, {
                                    method: "DELETE",
                                  });
                                  setProducts(
                                    products.filter((prod) => prod.id !== p.id),
                                  );
                                }}
                                className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors cursor-pointer"
                                title="حذف"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeTab === "orders" && (
            <div className="bg-white rounded-2xl border border-[#E5E5E7] p-5 flex flex-col flex-1 min-h-0">
              <div className="flex justify-between items-center mb-4">
                <div className="text-[16px] font-semibold text-[#1D1D1F]">
                  تاريخ الطلبات ومراجعة المدفوعات
                </div>
                <div className="flex gap-3">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-[#E5E5E7] rounded-lg bg-white text-[#1D1D1F] outline-none focus:border-[#0071E3]"
                  >
                    <option value="all">الكل</option>
                    <option value="pending">قيد المراجعة</option>
                    <option value="approved">مكتمل</option>
                    <option value="rejected">مرفوض</option>
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(e) =>
                      setSortOrder(e.target.value as "desc" | "asc")
                    }
                    className="px-3 py-1.5 text-sm border border-[#E5E5E7] rounded-lg bg-white text-[#1D1D1F] outline-none focus:border-[#0071E3]"
                  >
                    <option value="desc">الأحدث أولاً</option>
                    <option value="asc">الأقدم أولاً</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
                {orders.length === 0 ? (
                  <div className="text-sm text-[#86868B] text-center p-8 bg-[#FAFAFA] rounded-xl border border-[#E5E5E7]">
                    لا توجد طلبات جديدة حالياً.
                  </div>
                ) : (
                  orders
                    .filter(
                      (o) =>
                        filterStatus === "all" || o.status === filterStatus,
                    )
                    .sort((a, b) => {
                      const aTime = new Date(a.timestamp).getTime();
                      const bTime = new Date(b.timestamp).getTime();
                      return sortOrder === "desc"
                        ? bTime - aTime
                        : aTime - bTime;
                    })
                    .map((o) => (
                      <div
                        key={o.id}
                        className="flex flex-col sm:flex-row gap-6 p-6 border border-[#E5E5E7] shadow-sm hover:shadow-md transition-all rounded-2xl bg-white group relative overflow-hidden"
                      >
                        {/* Status Accent Bar */}
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-1 ${
                            o.status === "pending"
                              ? "bg-orange-400"
                              : o.status === "approved"
                                ? "bg-[#34C759]"
                                : "bg-red-500"
                          }`}
                        />

                        {/* Image Thumbnail */}
                        {o.photoUrl ? (
                          <div
                            className="relative w-full sm:w-48 h-48 sm:h-auto rounded-xl border border-[#E5E5E7] bg-[#FAFAFA] overflow-hidden cursor-pointer shrink-0 shadow-sm"
                            onClick={() => setExpandedImage(o.photoUrl)}
                          >
                            <img
                              src={o.photoUrl}
                              alt="إيصال الدفع"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute flex flex-col items-center justify-center inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                              <svg
                                className="w-8 h-8 text-white mb-2"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                />
                              </svg>
                              <span className="text-white text-sm font-medium">
                                تكبير إيصال الدفع
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full sm:w-48 h-48 sm:h-auto rounded-xl border border-dashed border-[#E5E5E7] bg-[#FAFAFA] flex flex-col items-center justify-center text-[#86868B] text-sm shrink-0">
                            <svg
                              className="w-8 h-8 mb-2 opacity-50"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span>لا يوجد إيصال مرفق</span>
                          </div>
                        )}

                        {/* Order Info */}
                        <div className="flex flex-col flex-1 pl-2">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span
                                  className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${o.type === "wallet" ? "bg-[#F2A900]/10 text-[#F2A900]" : "bg-[#0071E3]/10 text-[#0071E3]"}`}
                                >
                                  {o.type === "wallet"
                                    ? "شحن محفظة"
                                    : "شراء منتج"}
                                </span>
                                <span className="text-[#E5E5E7]">•</span>
                                <span className="text-[11px] uppercase tracking-wider font-semibold text-[#86868B]">
                                  طلب #{o.id.slice(-6)}
                                </span>
                                <span className="text-[#E5E5E7]">•</span>
                                <span className="text-[12px] text-[#86868B]">
                                  {new Date(o.timestamp).toLocaleString(
                                    "ar-EG",
                                    { dateStyle: "medium", timeStyle: "short" },
                                  )}
                                </span>
                              </div>
                              <h4 className="text-lg font-bold text-[#1D1D1F] leading-tight mb-2">
                                {o.type === "wallet"
                                  ? `شحن محفظة بقيمة $${o.amount}`
                                  : o.product?.title || "منتج محذوف"}
                              </h4>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-[#F5F5F7] flex items-center justify-center text-xs">
                                  👤
                                </div>
                                <span className="text-sm text-[#1D1D1F] font-medium">
                                  @{o.username || o.userId}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-[12px] px-3 py-1.5 rounded-lg font-semibold border flex items-center gap-1.5 ${
                                o.status === "pending"
                                  ? "bg-orange-50 text-orange-700 border-orange-200"
                                  : o.status === "approved"
                                    ? "bg-[#E8F5E9] text-[#2E7D32] border-green-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                              }`}
                            >
                              {o.status === "pending" && (
                                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                              )}
                              {o.status === "pending"
                                ? "قيد المراجعة"
                                : o.status === "approved"
                                  ? "مكتمل"
                                  : "مرفوض"}
                            </span>
                          </div>

                          {/* Progress and Details UI */}
                          <div className="bg-[#FAFAFA] rounded-xl p-4 border border-[#E5E5E7] mb-4 flex-1">
                            <div className="text-sm font-medium text-[#1D1D1F] mb-1">
                              تفاصيل الدفع
                            </div>
                            <div className="text-sm text-[#86868B] mb-3">
                              المبلغ المطلوب:{" "}
                              <span className="font-semibold text-[#1D1D1F]">
                                $
                                {o.type === "wallet"
                                  ? o.amount
                                  : o.product?.price || "غير معروف"}
                              </span>
                            </div>

                            {o.status === "pending" && (
                              <div className="flex items-center gap-2 text-xs text-orange-700 font-medium">
                                في انتظار مراجعتك للإيصال وتأكيد الدفع لتسليم
                                الطلب للعميل.
                              </div>
                            )}

                            {o.status === "approved" &&
                              !o.product?.downloadLink &&
                              o.type === "wallet" && (
                                <div className="flex flex-col gap-1 text-xs text-[#2E7D32] font-medium">
                                  <span className="flex items-center gap-1">
                                    ✓ تمت إضافته لرصيد المحفظة بنجاح
                                  </span>
                                </div>
                              )}

                            {o.status === "approved" &&
                              o.product?.downloadLink && (
                                <div className="flex flex-col gap-1 text-xs text-[#2E7D32] font-medium">
                                  <span className="flex items-center gap-1">
                                    ✓ تمت الموافقة وتسليم المنتج للعميل
                                  </span>
                                  <span className="text-[#1D1D1F] mt-1">
                                    الرابط المرسل:{" "}
                                    <a
                                      href={o.product.downloadLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#0071E3] hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {o.product.downloadLink}
                                    </a>
                                  </span>
                                </div>
                              )}

                            {o.status === "rejected" && (
                              <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                                ⨯ تم رفض الطلب
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          {o.status === "pending" && (
                            <div className="flex flex-wrap gap-3 mt-auto">
                              <button
                                onClick={async () => {
                                  const res = await fetch(
                                    `/api/orders/${o.id}/approve`,
                                    { method: "POST" },
                                  );
                                  if (res.ok) {
                                    setOrders(
                                      orders.map((order) =>
                                        order.id === o.id
                                          ? { ...order, status: "approved" }
                                          : order,
                                      ),
                                    );
                                    fetch("/api/products")
                                      .then((r) => r.json())
                                      .then(setProducts);
                                  }
                                }}
                                className="flex-1 py-2.5 text-sm bg-[#34C759] hover:bg-[#2E7D32] text-white font-semibold rounded-xl cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-2"
                              >
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                موافقة وتسليم
                              </button>
                              <button
                                onClick={async () => {
                                  const res = await fetch(
                                    `/api/orders/${o.id}/reject`,
                                    { method: "POST" },
                                  );
                                  if (res.ok) {
                                    setOrders(
                                      orders.map((order) =>
                                        order.id === o.id
                                          ? { ...order, status: "rejected" }
                                          : order,
                                      ),
                                    );
                                  }
                                }}
                                className="flex-1 py-2.5 text-sm bg-white hover:bg-red-50 text-red-600 font-semibold rounded-xl cursor-pointer transition-colors border border-red-200 flex items-center justify-center gap-2"
                              >
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                                رفض وإلغاء
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {activeTab === "customers" && (
            <div className="bg-white rounded-2xl border border-[#E5E5E7] p-5 flex flex-col flex-1 min-h-0">
              <div className="text-[16px] font-semibold mb-6 flex items-center justify-between text-[#1D1D1F]">
                <div>
                  قائمة العملاء وإدارة الرصيد
                  <span className="block text-xs font-normal text-[#86868B] mt-1">
                    تذكير: 1 عملة رصيد = 1 دولار (تلقائياً)
                  </span>
                </div>
                <span className="text-xs font-normal text-[#86868B] bg-[#FAFAFA] px-3 py-1.5 rounded-lg border border-[#E5E5E7]">
                  إجمالي: {users.length}
                </span>
              </div>

              <div className="bg-[#FAFAFA] rounded-xl border border-[#E5E5E7] p-4 mb-5 flex flex-col gap-3">
                <div className="text-sm font-semibold text-[#1D1D1F]">
                  إضافة/تعديل رصيد سريع لأي شخص عبر الـ ID
                </div>
                <form
                  className="flex flex-col sm:flex-row gap-3 items-end"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const userId = fd.get("userId");
                    const amount = parseFloat(fd.get("amount") as string);
                    if (!userId || isNaN(amount))
                      return alert("بيانات غير صالحة");
                    const res = await fetch(`/api/users/${userId}/balance`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ amount }),
                    });
                    if (res.ok) {
                      alert("تم إضافة الرصيد بنجاح!");
                      (e.target as HTMLFormElement).reset();
                    } else {
                      alert("حدث خطأ");
                    }
                  }}
                >
                  <div className="flex-1 w-full">
                    <label className="text-xs text-[#86868B] font-medium block mb-1">
                      Telegram ID (يمكنك تزويد رصيد أي شخص)
                    </label>
                    <input
                      name="userId"
                      placeholder="مثال: 12345678"
                      required
                      className="w-full border border-[#E5E5E7] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0071E3] transition-colors"
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="text-xs text-[#86868B] font-medium block mb-1">
                      المبلغ (الإضافة بالموجب، والخصم بالسالب)
                    </label>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      placeholder="مثال: 5 للحصول على $5، أو -5 لخصمها"
                      required
                      className="w-full border border-[#E5E5E7] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0071E3] transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full sm:w-auto bg-[#0071E3] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#005bb5] transition-colors shadow-sm cursor-pointer border border-transparent"
                  >
                    تأكيد العملية
                  </button>
                </form>
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto pr-2 pb-4">
                {users.length === 0 ? (
                  <div className="text-sm text-[#86868B] text-center p-8 bg-[#FAFAFA] rounded-xl border border-[#E5E5E7]">
                    لا يوجد عملاء حتى الآن.
                  </div>
                ) : (
                  users.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-[#E5E5E7] rounded-xl bg-[#FAFAFA] hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#0071E3]/10 text-[#0071E3] rounded-full flex items-center justify-center font-bold text-sm">
                          {u.name.substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-[#1D1D1F]">
                            {u.name}
                          </div>
                          <div className="text-xs text-[#86868B] font-mono">
                            ID: {u.id}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm border border-[#E5E5E7] bg-white px-3 py-2 rounded-lg font-medium text-[#1D1D1F] min-w-[120px] text-center">
                          رصيد: ${parseFloat(String(u.balance || 0)).toFixed(2)}
                        </div>
                        <button
                          onClick={async () => {
                            const raw = prompt(
                              `أدخل المبلغ المراد إضافته (أو خصمه باستخدام -) للعميل ${u.name}\n(الرصيد الحالي: $${parseFloat(String(u.balance || 0)).toFixed(2)})`,
                            );
                            if (!raw) return;
                            const amount = parseFloat(raw);
                            if (isNaN(amount)) return alert("مبلغ غير صالح.");

                            const res = await fetch(
                              `/api/users/${u.id}/balance`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ amount }),
                              },
                            );
                            if (res.ok) {
                              const updatedUser = await res.json();
                              setUsers(
                                users.map((user) =>
                                  user.id === updatedUser.id
                                    ? updatedUser
                                    : user,
                                ),
                              );
                            }
                          }}
                          className="bg-[#0071E3] hover:bg-[#005bb5] text-white text-xs px-3 py-2 rounded-lg transition-colors font-medium whitespace-nowrap cursor-pointer shadow-sm"
                        >
                          تعديل الرصيد 💰
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-white rounded-2xl border border-[#E5E5E7] p-5 flex flex-col w-[600px] max-w-full">
              <div className="text-[16px] font-semibold mb-6 text-[#1D1D1F]">
                الإعدادات وطرق الدفع
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);

                  const res = await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      lowStockThreshold: fd.get("lowStockThreshold"),
                      paymentMethods: paymentMethodsList
                        .map((s) => s.trim())
                        .filter(Boolean),
                      maintenanceMode: fd.get("maintenanceMode") !== null,
                    }),
                  });
                  if (res.ok) {
                    const newSettings = await res.json();
                    setSettings(newSettings);
                    setPaymentMethodsList(newSettings.paymentMethods || []);
                    alert("تم حفظ الإعدادات بنجاح!");
                  }
                }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#1D1D1F]">
                    الحد الأدنى للتنبيه بنفاد المخزون (الكمية):
                  </label>
                  <p className="text-[11px] text-[#86868B]">
                    سيقوم البوت بإرسال تنبيه للإدارة عندما تصل كمية أي منتج إلى
                    هذا الحد أو أقل.
                  </p>
                  <input
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    defaultValue={settings.lowStockThreshold}
                    className="border border-[#E5E5E7] rounded-md p-2 text-sm outline-none focus:border-[#0071E3] mt-1 w-32"
                  />
                </div>

                <hr className="border-[#E5E5E7]" />

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-[#1D1D1F] cursor-pointer">
                    <input
                      type="checkbox"
                      name="maintenanceMode"
                      defaultChecked={settings.maintenanceMode}
                      className="w-4 h-4 text-[#0071E3] rounded border-[#E5E5E7] focus:ring-[#0071E3]"
                    />
                    تفعيل وضع الصيانة 🛠️
                  </label>
                  <p className="text-[11px] text-[#86868B] pr-6">
                    عند تفعيل وضع الصيانة، سيتم رسالة للعملاء بأن المتجر تحت
                    الصيانة وسيتم إيقاف الشراء مؤقتاً.
                  </p>
                </div>

                <hr className="border-[#E5E5E7]" />

                <div className="flex flex-col gap-2">
                  <label className="text-[15px] font-semibold text-[#1D1D1F]">
                    وسائل الدفع المتاحة للعملاء
                  </label>
                  <p className="text-[12px] text-[#86868B] mb-2">
                    قم بإضافة الطرق التي تقبل الدفع من خلالها. ستظهر هذه
                    التعليمات للعميل عند محاولة الشراء.
                  </p>

                  <div className="flex flex-col gap-3">
                    {paymentMethodsList.map((method, idx) => (
                      <div
                        key={idx}
                        className="flex gap-2 items-start bg-[#F5F5F7] p-3 rounded-xl border border-[#E5E5E7] group"
                      >
                        <div className="flex-1">
                          <textarea
                            value={method}
                            onChange={(e) => {
                              const newList = [...paymentMethodsList];
                              newList[idx] = e.target.value;
                              setPaymentMethodsList(newList);
                            }}
                            className="w-full bg-transparent border-none p-0 text-sm outline-none resize-none focus:ring-0 leading-relaxed font-mono"
                            dir="ltr"
                            rows={2}
                            placeholder="مثال: Binance Pay: 123456789"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethodsList(
                              paymentMethodsList.filter((_, i) => i !== idx),
                            );
                          }}
                          className="text-[#86868B] hover:text-red-500 hover:bg-red-50 w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer"
                          title="حذف الطريقة"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentMethodsList([
                            ...paymentMethodsList,
                            "Binance Pay ID: ",
                          ])
                        }
                        className="text-[12px] bg-white border border-[#E5E5E7] text-[#1D1D1F] px-3 py-1.5 rounded-lg hover:border-[#F2A900] hover:text-[#F2A900] transition-colors cursor-pointer font-medium flex items-center gap-1.5"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F2A900]"></span>
                        Binance Pay
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentMethodsList([
                            ...paymentMethodsList,
                            "InstaPay: ",
                          ])
                        }
                        className="text-[12px] bg-white border border-[#E5E5E7] text-[#1D1D1F] px-3 py-1.5 rounded-lg hover:border-[#6F42C1] hover:text-[#6F42C1] transition-colors cursor-pointer font-medium flex items-center gap-1.5"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#6F42C1]"></span>
                        InstaPay
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentMethodsList([
                            ...paymentMethodsList,
                            "Vodafone Cash: ",
                          ])
                        }
                        className="text-[12px] bg-white border border-[#E5E5E7] text-[#1D1D1F] px-3 py-1.5 rounded-lg hover:border-[#E60000] hover:text-[#E60000] transition-colors cursor-pointer font-medium flex items-center gap-1.5"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#E60000]"></span>
                        Vodafone Cash
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentMethodsList([
                            ...paymentMethodsList,
                            "Bank Transfer:\nIBAN: \nBank: ",
                          ])
                        }
                        className="text-[12px] bg-white border border-[#E5E5E7] text-[#1D1D1F] px-3 py-1.5 rounded-lg hover:border-[#0071E3] hover:text-[#0071E3] transition-colors cursor-pointer font-medium flex items-center gap-1.5"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3]"></span>
                        تحويل بنكي
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentMethodsList([...paymentMethodsList, ""])
                        }
                        className="text-[12px] border border-dashed border-[#86868B] text-[#86868B] px-3 py-1.5 rounded-lg hover:border-[#1D1D1F] hover:text-[#1D1D1F] transition-colors cursor-pointer font-medium ml-auto"
                      >
                        + طريقة أخرى
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-4 px-6 py-2.5 text-[15px] font-medium bg-[#0071E3] text-white rounded-xl cursor-pointer hover:bg-[#005bb5] self-end transition-colors shadow-sm"
                >
                  حفظ الإعدادات بالكامل
                </button>
              </form>
            </div>
          )}
        </main>

        {showAddForm && (
          // ... already customized earlier in this document, so I'll append the expandedImage modal here instead of altering existing
          <></>
        )}

        {/* Add/Edit Form Modal */}
        {(showAddForm || editingProduct) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in zoom-in-95 duration-200 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-[#E5E5E7] flex flex-col">
              <h3 className="text-xl font-bold mb-6 text-[#1D1D1F]">
                {editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const payload = {
                    title: fd.get("title"),
                    price: parseFloat(fd.get("price") as string),
                    stock: parseInt(fd.get("stock") as string) || 0,
                    description: fd.get("description"),
                    downloadLink: fd.get("downloadLink"),
                    imageUrl: fd.get("imageUrl"),
                    icon: fd.get("icon"),
                  };

                  if (editingProduct) {
                    const res = await fetch(
                      `/api/products/${editingProduct.id}`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      },
                    );
                    if (res.ok) {
                      const updated = await res.json();
                      setProducts(
                        products.map((p) =>
                          p.id === editingProduct.id ? updated : p,
                        ),
                      );
                      setEditingProduct(null);
                    }
                  } else {
                    const res = await fetch("/api/products", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (res.ok) {
                      const newP = await res.json();
                      setProducts([...products, newP]);
                      setShowAddForm(false);
                    }
                  }
                }}
                className="flex flex-col gap-4"
              >
                <div>
                  <label className="block text-xs font-medium text-[#86868B] mb-1">
                    اسم المنتج
                  </label>
                  <input
                    defaultValue={editingProduct?.title}
                    required
                    name="title"
                    placeholder="اسم المنتج"
                    className="w-full border border-[#E5E5E7] rounded-md p-2.5 text-sm outline-none focus:border-[#0071E3] transition-colors bg-[#FAFAFA]"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#86868B] mb-1">
                      السعر ($)
                    </label>
                    <input
                      defaultValue={editingProduct?.price}
                      required
                      name="price"
                      type="number"
                      step="0.01"
                      placeholder="السعر"
                      className="w-full border border-[#E5E5E7] rounded-md p-2.5 text-sm outline-none focus:border-[#0071E3] transition-colors bg-[#FAFAFA]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#86868B] mb-1">
                      الكمية المتوفرة
                    </label>
                    <input
                      defaultValue={editingProduct?.stock}
                      required
                      name="stock"
                      type="number"
                      placeholder="المخزون"
                      className="w-full border border-[#E5E5E7] rounded-md p-2.5 text-sm outline-none focus:border-[#0071E3] transition-colors bg-[#FAFAFA]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#86868B] mb-1">
                    رابط التسليم (سري)
                  </label>
                  <input
                    defaultValue={editingProduct?.downloadLink}
                    name="downloadLink"
                    type="url"
                    placeholder="رابط التحميل / الوصول للمنتج"
                    className="w-full border border-[#E5E5E7] rounded-md p-2.5 text-sm outline-none focus:border-[#0071E3] transition-colors bg-[#FAFAFA]"
                  />
                  <p className="text-[10px] text-[#86868B] mt-1">
                    يُرسل حصرياً للمشتري بعد تأكيد الدفع.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1D1D1F] mb-1">
                    صورة المنتج
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="file"
                      id="imageUploadBtn"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const r = new FileReader();
                          r.onload = (evt) => {
                            const result = evt.target?.result as string;
                            (
                              document.getElementById(
                                "hiddenImageUrl",
                              ) as HTMLInputElement
                            ).value = result;
                            const preview =
                              document.getElementById("imagePreviewBox");
                            if (preview) {
                              preview.innerHTML = `<img src="${result}" class="w-10 h-10 object-cover rounded-md border border-[#E5E5E7]" />`;
                            }
                          };
                          r.readAsDataURL(file);
                        }
                      }}
                    />
                    <label
                      htmlFor="imageUploadBtn"
                      className="shrink-0 px-3 py-2 text-sm bg-[#F5F5F7] text-[#1D1D1F] rounded-md cursor-pointer hover:bg-[#E5E5E7] transition-colors border border-[#E5E5E7] font-medium shadow-sm"
                    >
                      رفع 📁
                    </label>
                    <input
                      id="hiddenImageUrl"
                      defaultValue={editingProduct?.imageUrl}
                      name="imageUrl"
                      type="text"
                      placeholder="أو ضع رابط URL مباشر"
                      className="w-full border border-[#E5E5E7] rounded-md p-2.5 text-sm outline-none focus:border-[#0071E3] transition-colors bg-[#FAFAFA]"
                    />
                    <div id="imagePreviewBox" className="w-10 h-10 shrink-0">
                      {editingProduct?.imageUrl && (
                        <img
                          src={editingProduct.imageUrl}
                          className="w-10 h-10 object-cover rounded-md border border-[#E5E5E7]"
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-[#86868B] mt-1">
                    يمكنك رفع صورة من جهازك، أو وضع رابطها. ستظهر للعميل في
                    قائمة المنتجات.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#86868B] mb-1">
                    أيقونة المنتج (إيموجي)
                  </label>
                  <input
                    defaultValue={editingProduct?.icon}
                    name="icon"
                    type="text"
                    placeholder="مثال: 🎮 أو 📚"
                    className="w-full border border-[#E5E5E7] rounded-md p-2.5 text-sm outline-none focus:border-[#0071E3] transition-colors bg-[#FAFAFA]"
                  />
                  <p className="text-[10px] text-[#86868B] mt-1">
                    إيموجي يعبر عن المنتج سيظهر في القوائم (اختياري).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#86868B] mb-1">
                    تفاصيل المنتج ووصفه
                  </label>
                  <textarea
                    defaultValue={editingProduct?.description}
                    required
                    name="description"
                    placeholder="وصف المنتج الذي سيظهر في المتجر..."
                    rows={3}
                    className="w-full border border-[#E5E5E7] rounded-md p-2.5 text-sm outline-none focus:border-[#0071E3] resize-none transition-colors bg-[#FAFAFA]"
                  ></textarea>
                </div>
                <div className="flex justify-end gap-3 mt-2 border-t border-[#E5E5E7] pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingProduct(null);
                    }}
                    className="px-5 py-2 text-sm text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5E7] rounded-lg cursor-pointer transition-colors font-medium"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm bg-[#0071E3] text-white rounded-lg cursor-pointer hover:bg-[#005bb5] transition-colors font-medium shadow-sm"
                  >
                    {editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {expandedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full flex flex-col items-center">
            <button
              className="absolute -top-12 right-0 text-white hover:text-gray-300 font-medium text-lg leading-none cursor-pointer"
              onClick={() => setExpandedImage(null)}
            >
              إغلاق ✕
            </button>
            <img
              src={expandedImage}
              alt="إيصال الدفع كامل"
              className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-6 py-3 text-sm cursor-pointer flex items-center gap-3 transition-colors
      ${
        active
          ? "text-[#1D1D1F] bg-[#F5F5F7] border-l-3 border-[#0071E3] font-medium"
          : "text-[#86868B] hover:bg-[#FAFAFA] border-l-3 border-transparent"
      }`}
    >
      <span className="text-lg grayscale opacity-70">{icon}</span>
      {label}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  trendColor,
}: {
  label: string;
  value: string;
  trend: string;
  trendColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E5E7] p-5 flex flex-col">
      <div className="text-[13px] text-[#86868B] mb-2">{label}</div>
      <div className="text-2xl font-semibold text-[#1D1D1F]">{value}</div>
      <div className={`text-[11px] mt-1 ${trendColor}`}>{trend}</div>
    </div>
  );
}

interface ActivityEntryProps {
  key?: React.Key;
  time: string;
  text: React.ReactNode;
}

function ActivityEntry({ time, text }: ActivityEntryProps) {
  return (
    <div className="border-r-2 border-[#E5E5E7] pr-3 py-0.5">
      <div className="text-[11px] text-[#86868B] mb-0.5">{time}</div>
      <div className="text-[#1D1D1F] [&_b]:text-[#0071E3]">{text}</div>
    </div>
  );
}
