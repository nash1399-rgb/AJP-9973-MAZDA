"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Reservation = {
  id: string;
  name: string;
  department: string;
  date: string;
  time: string;
  destination: string;
  reason: string;
  createdAt: number;
};

export default function Page() {
  const [form, setForm] = useState({
    name: "",
    department: "",
    date: "",
    time: "",
    destination: "",
    reason: "",
  });

  const [list, setList] = useState<Reservation[]>([]);

  // 🔥 即時讀取預約單
  useEffect(() => {
    const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      setList(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Reservation, "id">),
        }))
      );
    });

    return () => unsub();
  }, []);

  // 🔥 送出預約
  const submit = async () => {
    if (!form.name || !form.date || !form.time) return;

    await addDoc(collection(db, "reservations"), {
      ...form,
      createdAt: Date.now(),
    });

    setForm({
      name: "",
      department: "",
      date: "",
      time: "",
      destination: "",
      reason: "",
    });
  };

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "auto" }}>
      <h1>🚗 公務車預約系統</h1>

      {/* 表單 */}
      <input name="name" placeholder="姓名" value={form.name} onChange={handleChange} />
      <br />

      <input name="department" placeholder="單位" value={form.department} onChange={handleChange} />
      <br />

      <input name="date" type="date" value={form.date} onChange={handleChange} />
      <br />

      <input name="time" type="time" value={form.time} onChange={handleChange} />
      <br />

      <input name="destination" placeholder="目的地" value={form.destination} onChange={handleChange} />
      <br />

      <input name="reason" placeholder="事由" value={form.reason} onChange={handleChange} />
      <br />

      <button onClick={submit}>送出預約</button>

      <hr />

      {/* 列表 */}
      <h2>📋 預約紀錄</h2>

      {list.map((item) => (
        <div key={item.id} style={{ marginBottom: 10 }}>
          <b>{item.name}</b>（{item.department}）<br />
          {item.date} {item.time}<br />
          📍 {item.destination}<br />
          📝 {item.reason}
          <hr />
        </div>
      ))}
    </div>
  );
}