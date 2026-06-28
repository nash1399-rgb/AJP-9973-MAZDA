"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Fuel, ChevronLeft, ChevronRight, Lock, User, X } from "lucide-react"
import { getHolidayName } from "@/lib/holidays"
import { db } from "@/lib/firebase"
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore"

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]
const PASSCODE = "1234"

type Slot = "am" | "pm" | "full"
type BookMode = "am" | "pm" | "full"
type BookingInfo = { name: string; docId: string }

type Pending =
  | { kind: "book"; day: number }
  | { kind: "cancel"; day: number; slot: Slot; name: string }

export function VehicleBooking() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(6)
  const [bookings, setBookings] = useState<Record<string, BookingInfo>>({})

  const [pending, setPending] = useState<Pending | null>(null)
  const [bookMode, setBookMode] = useState<BookMode>("am")
  const [nameInput, setNameInput] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState(false)

  const touchStartX = useRef<number | null>(null)

  // Firebase Realtime Sync
  useEffect(() => {
    const q = query(collection(db, "vehicle_bookings"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      const data: Record<string, BookingInfo> = {}
      snap.docs.forEach((d) => {
        const v = d.data()
        const key = `${v.year}-${v.month}-${v.day}-${v.slot}`
        data[key] = { 
          name: v.name, 
          docId: d.id 
        }
      })
      setBookings(data)
    })
    return () => unsub()
  }, [])

  const { firstWeekday, daysInMonth } = useMemo(() => {
    const first = (new Date(year, month - 1, 1).getDay() + 6) % 7
    const total = new Date(year, month, 0).getDate()
    return { firstWeekday: first, daysInMonth: total }
  }, [year, month])

  const cells = useMemo(() => {
    const arr: (number | null)[] = []
    for (let i = 0; i < firstWeekday; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [firstWeekday, daysInMonth])

  function keyOf(day: number, slot: Slot) {
    return `${year}-${month}-${day}-${slot}`
  }

  // 修正型別安全：slot 只接受 'am' 或 'pm'
  function bookerOf(day: number, slot: "am" | "pm") {
    return bookings[keyOf(day, slot)]?.name || ""
  }

  function docIdOf(day: number, slot: "am" | "pm") {
    return bookings[keyOf(day, slot)]?.docId || ""
  }

  function changeMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setYear(y)
    setMonth(m)
  }

  // 左右滑動切換月份
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) changeMonth(dx < 0 ? 1 : -1)
    touchStartX.current = null
  }

  // 修正型別安全
  function requestBook(day: number, defaultSlot: "am" | "pm") {
    setNameInput("")
    setError(false)
    setBookMode(defaultSlot)
    setPending({ kind: "book", day })
  }

  function requestCancel(day: number, slot: "am" | "pm", name: string) {
    setCode("")
    setError(false)
    setPending({ kind: "cancel", day, slot, name })
  }

  async function confirm() {
    if (!pending) return
    try {
      if (pending.kind === "book") {
        const name = nameInput.trim()
        if (!name) { 
          setError(true)
          return
        }
        const tasks: Promise<any>[] = []
        if ((bookMode === "am" || bookMode === "full") && !bookerOf(pending.day, "am")) {
          tasks.push(
            addDoc(collection(db, "vehicle_bookings"), {
              year, month, day: pending.day, slot: "am", name, createdAt: Date.now(),
            })
          )
        }
        if ((bookMode === "pm" || bookMode === "full") && !bookerOf(pending.day, "pm")) {
          tasks.push(
            addDoc(collection(db, "vehicle_bookings"), {
              year, month, day: pending.day, slot: "pm", name, createdAt: Date.now(),
            })
          )
        }
        await Promise.all(tasks)
      } else {
        if (code !== PASSCODE) {
          setError(true)
          return
        }
        const amName = bookerOf(pending.day, "am")
        const pmName = bookerOf(pending.day, "pm")
        const amId = docIdOf(pending.day, "am")
        const pmId = docIdOf(pending.day, "pm")

        const deleteTasks: Promise<void>[] = []
        if (amName && pmName && amName === pmName) {
          if (amId) deleteTasks.push(deleteDoc(doc(db, "vehicle_bookings", amId)))
          if (pmId) deleteTasks.push(deleteDoc(doc(db, "vehicle_bookings", pmId)))
        } else {
          const targetSlot = pending.slot === "full" ? "am" : pending.slot
          const targetDocId = docIdOf(pending.day, targetSlot)
          if (targetDocId) deleteTasks.push(deleteDoc(doc(db, "vehicle_bookings", targetDocId)))
        }
        await Promise.all(deleteTasks)
      }
      closeModal()
    } catch (err) {
      console.error("Firebase 操作失敗:", err)
    }
  }

  function closeModal() {
    setPending(null)
    setNameInput("")
    setCode("")
    setError(false)
  }

  const monthBookerName = pending?.kind === "cancel" ? pending.name : ""

  return (
    <div 
      className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-5 min-h-screen bg-[#e2e8f0] text-slate-900 overflow-x-hidden"
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}
    >
      {/* 🏛️ Header card */}
      <header className="rounded-xl border border-slate-300 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-balance text-base font-bold text-slate-900 tracking-tight">
          邑菖工程顧問有限公司－公務車預約系統
        </h1>
        <p className="mt-0.5 text-xs font-medium text-slate-400">線上即時公務車預約登記平台</p>
      </header>

      {/* 🚗 車牌與保養資訊欄塊 */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#1e293b] p-4 text-white shadow-md">
        
        {/* 上半部：車牌資訊與照片左右排列 */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 flex flex-col gap-1.5 text-base font-bold text-slate-100 leading-relaxed">
            <div className="flex items-center gap-2 border-b border-slate-700 pb-1.5 mb-0.5">
              <span className="text-base font-bold tracking-wide text-[#39ff14]">
                AJP-9973 <span className="text-sm font-normal text-slate-400">（95無鉛）</span>
              </span>
              <Fuel className="size-4.5 text-slate-400 shrink-0" />
            </div>
            <div>下次保養里程數：<span className="font-bold text-white">129526 公里</span></div>
            <div>下次汽車檢驗日：<span className="font-bold text-white">2026/12/27</span></div>
          </div>
          
          <div className="w-[84px] h-[64px] shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-neutral-800 shadow-sm">
            <img
              src="/images/ajp-9973.jpg"
              alt="公務車照片"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* 下半部：保養廠與電話 */}
        <div className="border-t border-slate-700/60 pt-2.5 mt-0.5 text-base font-bold text-slate-200 leading-relaxed flex flex-col gap-0.5">
          <div>
            保養廠：祥盛汽車 <span className="font-normal text-slate-400 text-sm">(新竹市經國路一段388之3號)</span>
          </div>
          <div className="text-amber-400">
            電話：03-5353897
          </div>
        </div>
      </div>

      {/* 📅 日曆主體外框 */}
      <section className="overflow-hidden rounded-xl border border-slate-300 bg-white p-3 shadow-md">
        
        {/* 月份切換標頭 */}
        <div className="flex items-center justify-between rounded-lg bg-slate-900 px-2 py-2 shadow-sm">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors active:scale-95 hover:bg-slate-800 hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="select-none text-sm font-semibold tracking-wider text-white">
            {year} 年 {month} 月
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors active:scale-95 hover:bg-slate-800 hover:text-white"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* 禮拜標頭 */}
        <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-md bg-slate-200/80 text-center text-xs font-bold text-slate-700 border border-slate-300">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`py-2 ${
                i === 5 || i === 6 ? "text-rose-600 bg-rose-100/50" : ""
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 日曆網格 */}
        <div className="mt-2 grid grid-cols-7 gap-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {cells.map((day, idx) => {
            const col = idx % 7
            const weekend = col === 5 || col === 6
            
            if (day === null) return (
              <div key={`empty-${idx}`} className="min-h-[105px]" aria-hidden="true" />
            )
            
            const today = new Date()
            const isToday =
              today.getFullYear() === year &&
              today.getMonth() + 1 === month &&
              today.getDate() === day

            const holiday = getHolidayName(year, month, day)
            const isOff = weekend || !!holiday
            const am = bookerOf(day, "am")
            const pm = bookerOf(day, "pm")
            const booked = !!am || !!pm
            
            return (
              <div
                key={`${year}-${month}-${day}`}
                className={`relative flex min-h-[105px] flex-col overflow-hidden rounded-lg border transition-all duration-150
                  ${
                    isToday
                      ? "border-slate-950 ring-2 ring-slate-950/20 z-10 bg-slate-100/50"
                      : booked
                        ? "border-amber-400 bg-amber-50/20"
                        : isOff
                          ? "border-rose-300 bg-rose-100/30"
                          : "border-slate-300 bg-white"
                  }`}
              >
                {/* 🛠️ 日曆格日期與節日區塊：改為 flex-col 垂直排列，強迫節日名稱精確切到下一行 */}
                <div className={`px-1.5 pt-1 pb-1 flex flex-col items-start justify-start border-b gap-0.5 ${isOff ? "bg-rose-100/40 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
                  <span className={`text-sm font-extrabold leading-none ${
                    isToday ? "text-slate-950 underline decoration-2 underline-offset-2" : isOff ? "text-rose-600" : "text-slate-800"
                  }`}>
                    {day}
                  </span>
                  
                  {holiday && (
                    <span className="block text-[9px] font-extrabold text-rose-700 text-left leading-tight w-full break-all truncate">
                      {holiday}
                    </span>
                  )}
                </div>

                {/* AM / PM 時段 */}
                <div className="flex flex-1 flex-col justify-end p-1 gap-1">
                  <SlotArea
                    label="上午"
                    booker={am}
                    onBook={() => requestBook(day, "am")}
                    onCancel={() => requestCancel(day, "am", am)}
                  />
                  <div className="h-px bg-transparent" />
                  <SlotArea
                    label="下午"
                    booker={pm}
                    onBook={() => requestBook(day, "pm")}
                    onCancel={() => requestCancel(day, "pm", pm)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <p className="text-center text-[11px] font-medium text-slate-500">
        左右滑動切換月份 ‧ 點擊時段預約 ‧ 取消密碼 1234
      </p>

      {/* Modal 彈窗 */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={closeModal}>
          <div className="w-full max-w-xs rounded-xl border border-slate-300 bg-white p-5 text-slate-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                {pending.kind === "book" ? "預約登記" : "取消預約"}
              </h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="size-4" />
              </button>
            </div>

            {pending.kind === "book" ? (
              <>
                <p className="mt-2.5 text-xs text-slate-500">
                  日期：<span className="font-semibold text-slate-800">{`${year}/${month}/${pending.day}`}</span>
                </p>

                <div className="mt-3 grid grid-cols-3 gap-1">
                  {(["am", "pm", "full"] as BookMode[]).map((m) => {
                    const text = m === "am" ? "上午" : m === "pm" ? "下午" : "全天"
                    const amTaken = !!bookerOf(pending.day, "am")
                    const pmTaken = !!bookerOf(pending.day, "pm")
                    const disabled = m === "full" ? amTaken || pmTaken : m === "am" ? amTaken : pmTaken
                    const selected = bookMode === m
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setBookMode(m)
                          setError(false)
                        }}
                        className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
                          disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 opacity-50"
                            : selected
                              ? "border-slate-900 bg-slate-950 text-white font-semibold"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {text}
                      </button>
                    )
                  })}
                </div>

                <input
                  type="text"
                  autoFocus
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value)
                    setError(false)
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirm() }}
                  placeholder="請輸入姓名"
                  className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-sm font-medium text-slate-800 outline-none focus:border-slate-900"
                />
                {error && <p className="mt-1 text-[11px] font-medium text-rose-500">請輸入姓名</p>}
              </>
            ) : (
              <>
                <p className="mt-2.5 text-xs text-slate-500 leading-normal">
                  將取消 <span className="font-semibold text-slate-800">{`${year}/${month}/${pending.day}`}</span> 的預約：<br />
                  使用者：<span className="font-semibold text-slate-900">{monthBookerName}</span>
                </p>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value)
                    setError(false)
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirm() }}
                  placeholder="輸入管制密碼"
                  className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-sm tracking-widest text-slate-800 outline-none focus:border-slate-900"
                />
                {error && <p className="mt-1 text-[11px] font-medium text-rose-500">密碼錯誤</p>}
              </>
            )}

            <div className="mt-4 flex gap-1.5 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-md border border-slate-300 bg-white py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirm}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold text-white shadow-sm ${
                  pending.kind === "book"
                    ? "bg-slate-900 hover:bg-slate-800"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SlotArea({
  label,
  booker,
  onBook,
  onCancel,
}: {
  label: string
  booker: string
  onBook: () => void
  onCancel: () => void
}) {
  const active = !!booker
  return (
    <button
      type="button"
      onClick={active ? onCancel : onBook}
      aria-pressed={active}
      className={`group w-full flex items-center justify-between px-1.5 py-1 text-[11px] rounded transition-all border
        ${
          active
            ? "bg-amber-200 border-amber-300 text-amber-950 font-bold hover:bg-rose-100 hover:border-rose-300 hover:text-rose-700 shadow-sm"
            : "border-slate-200/60 text-slate-600 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-800"
        }`}
    >
      <span className={`scale-90 origin-left tracking-tight font-semibold ${active ? "text-amber-900/80 group-hover:text-rose-700" : "text-slate-500"}`}>
        {label}
      </span>
      
      {active ? (
        <span className="truncate max-w-[46px] text-right font-black tracking-tight text-slate-950">
          {booker}
        </span>
      ) : (
        <span className="text-[10px] text-slate-400 group-hover:text-slate-600 font-bold transition-colors">
          +
        </span>
      )}
    </button>
  )
}