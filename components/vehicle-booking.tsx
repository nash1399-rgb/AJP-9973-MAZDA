"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Fuel, ChevronLeft, ChevronRight, Lock, User, X, Sun, SunMoon, Plus } from "lucide-react"
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

type Slot = "am" | "pm"
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

  function bookerOf(day: number, slot: Slot) {
    return bookings[keyOf(day, slot)]?.name || ""
  }

  function docIdOf(day: number, slot: Slot) {
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

  function requestBook(day: number, defaultSlot: Slot) {
    setNameInput("")
    setError(false)
    setBookMode(defaultSlot)
    setPending({ kind: "book", day })
  }

  function requestCancel(day: number, slot: Slot, name: string) {
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
          const targetDocId = docIdOf(pending.day, pending.slot)
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
      className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 min-h-screen bg-[#f8fafc] text-slate-800 overflow-x-hidden" // 調整為高質感明亮暖白襯底
      style={{ fontFamily: "'Times New Roman', 'Microsoft JhengHei', '微軟正黑體', sans-serif" }}
    >
      {/* Header card：半透明微光玻璃質感 */}
      <header className="rounded-xl border-2 border-[#a3cfbb] bg-[#d1e7dd]/90 backdrop-blur-md px-5 py-4 shadow-sm transition-all duration-300">
        <h1 className="text-balance text-lg font-black text-[#0f5132]">
          邑菖工程顧問有限公司－公務車預約系統
        </h1>
        <p className="mt-1 text-xs font-semibold text-[#146c43]">線上即時預約的登記平台</p>
      </header>

      {/* License plate banner：高飽和深綠襯托螢光字 */}
      <div className="flex items-stretch gap-3 overflow-hidden rounded-xl border-2 border-[#146c43] bg-[#0f5132] p-3 text-white shadow-md transition-all duration-300">
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-wide text-[#39ff14] drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
              AJP-9973（95無鉛汽油）
            </span>
            <Fuel className="size-5 shrink-0 text-orange-400" aria-hidden="true" />
          </div>
          <div className="text-xs font-semibold text-emerald-100">下次保養里程數 129526 公里</div>
          <div className="text-xs font-semibold text-emerald-100">下次汽車檢驗日期 2026 年 12 月 27 日</div>
          <div className="text-[11px] leading-relaxed text-emerald-200/90 font-medium">
            保養廠：祥盛汽車 (新竹市經國路一段388之3號) <br />
            電話：03-5353897
          </div>
        </div>
        <img
          src="/images/ajp-9973.jpg"
          alt="公務車照片"
          className="w-1/4 shrink-0 self-center rounded-md object-cover bg-neutral-800 min-h-[60px] border border-emerald-700 shadow shadow-black/20"
        />
      </div>

      {/* 日曆外框：精緻半透明莫蘭迪綠毛玻璃面板 */}
      <section className="overflow-hidden rounded-xl border-2 border-[#bccc9a] bg-[#eaf4e3]/90 backdrop-blur-md p-3 shadow-xl transition-all duration-300">
        
        {/* Calendar header */}
        <div className="flex items-center justify-between rounded-lg bg-[#0f5132] px-2 py-2.5 shadow-md">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="flex size-9 items-center justify-center rounded-md text-slate-300 transition-all active:scale-95 hover:bg-black/20 hover:text-white"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="select-none text-lg font-black tracking-widest text-white">
            {year} 年 {month} 月
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="flex size-9 items-center justify-center rounded-md text-slate-300 transition-all active:scale-95 hover:bg-black/20 hover:text-white"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Weekday header */}
        <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-md bg-[#0f5132] text-center text-sm font-bold text-white shadow">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`border-r-2 border-white/10 py-1.5 last:border-r-0 ${
                i === 5 || i === 6 ? "font-black text-rose-400 bg-white/5" : "text-white"
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="mt-2 grid grid-cols-7 gap-1.5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {cells.map((day, idx) => {
            const col = idx % 7
            const weekend = col === 5 || col === 6
            
            if (day === null) return (
              <div key={`empty-${idx}`} className="min-h-[110px]" aria-hidden="true" />
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
                className={`relative flex min-h-[110px] flex-col overflow-hidden rounded-md border-2 transition-all duration-300 ease-in-out
                  hover:-translate-y-[2px] hover:shadow-md hover:z-10
                  ${
                    isToday
                      ? "border-blue-600 ring-2 ring-blue-500/20 z-10"
                      : booked
                        ? "border-amber-500/90"
                        : isOff
                          ? "border-rose-300"
                          : "border-[#c5e1a5]"
                  } 
                  ${isOff ? "bg-rose-100/90" : "bg-white"}`} // 平日格改為純白色 (bg-white)，放假日採用飽和粉紅，大幅提升字體易讀性
              >
                {/* 日曆格日期橫條 */}
                <div className={`px-1 pt-0.5 pb-0.5 border-b-2 ${isOff ? "bg-rose-200/70 border-rose-200" : "bg-slate-100 border-slate-200"}`}>
                  <div className="flex flex-col items-center">
                    <span className={`text-sm font-black ${isOff ? "text-rose-700" : "text-slate-900"}`}>
                      {day}
                    </span>
                  </div>
                  <span className="block h-3 truncate text-center text-[9px] font-black leading-3 text-rose-600">
                    {holiday ?? ""}
                  </span>
                </div>

                {/* AM / PM Slots 互動區域 */}
                <div className="flex flex-1 flex-col">
                  <SlotArea
                    label="上午"
                    icon={<Sun className="size-3 text-amber-500" />}
                    booker={am}
                    onBook={() => requestBook(day, "am")}
                    onCancel={() => requestCancel(day, "am", am)}
                  />
                  <div className="h-px bg-slate-200" />
                  <SlotArea
                    label="下午"
                    icon={<SunMoon className="size-3 text-blue-500" />}
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

      <p className="py-2 text-center text-xs font-medium text-slate-500">
        《左右滑動或點箭頭切換月份；點擊時段預約，取消需輸入管制密碼1234》
      </p>

      {/* Modal 彈窗：採用極其精緻的半透明明亮毛玻璃特效 */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-all duration-300" onClick={closeModal}>
          <div className="w-full max-w-xs rounded-xl border-2 border-white/60 bg-white/95 p-5 text-slate-800 shadow-2xl backdrop-blur-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="flex items-center gap-1.5 text-base font-black text-[#0f5132]">
                {pending.kind === "book" ? (
                  <>
                    <User className="size-4" />
                    預約登記
                  </>
                ) : (
                  <>
                    <Lock className="size-4" />
                    取消預約
                  </>
                )}
              </h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="size-5" />
              </button>
            </div>

            {pending.kind === "book" ? (
              <>
                <p className="mt-2.5 text-sm font-medium text-slate-600">
                  預約 <span className="font-black text-[#0f5132]">{`${year}/${month}/${pending.day}`}</span>，請選擇時段並輸入姓名。
                </p>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
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
                        className={`rounded-md border-2 py-2 text-sm font-bold transition-all duration-200 ${
                          disabled
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 opacity-50"
                            : selected
                              ? "border-amber-500 bg-amber-500 text-white shadow-sm shadow-amber-500/30"
                              : "border-slate-200 bg-white text-[#0f5132] hover:bg-slate-50"
                        }`}
                      >
                        {text}
                      </button>
                    )
                  })}
                </div>

                {/* 姓名輸入框 */}
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
                  className="mt-3.5 w-full rounded-md border-2 border-slate-200 bg-white px-3 py-2 text-center text-base font-bold text-[#0f5132] outline-none focus:border-[#0f5132] transition-colors"
                />

                {error && <p className="mt-1.5 text-xs font-bold text-rose-600">請輸入姓名！</p>}
              </>
            ) : (
              <>
                <p className="mt-2.5 text-sm font-medium text-slate-600">
                  取消 <span className="font-black text-[#0f5132]">{`${year}/${month}/${pending.day}`}</span> 時段的預約：<br />
                  <span className="font-black text-amber-900">{monthBookerName}</span>，請輸入管制密碼。
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
                  placeholder="請輸入密碼"
                  className="mt-3.5 w-full rounded-md border-2 border-slate-200 bg-white px-3 py-2 text-center text-lg tracking-[0.4em] font-bold text-[#0f5132] outline-none focus:border-[#0f5132]"
                />
                {error && <p className="mt-1.5 text-xs font-bold text-rose-600">密碼錯誤，請重新輸入。</p>}
              </>
            )}

            <div className="mt-4 flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-md border border-slate-200 bg-white py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={confirm}
                className={`flex-1 rounded-md py-2 text-sm font-black shadow-sm text-white transition-colors ${
                  pending.kind === "book"
                    ? "bg-[#0f5132] hover:bg-[#146c43]"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {pending.kind === "book" ? "確認預約" : "確認取消"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* 時段 SlotArea 元件 */
function SlotArea({
  label,
  icon,
  booker,
  onBook,
  onCancel,
}: {
  label: string
  icon: React.ReactNode
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
      className={`flex flex-1 flex-col items-center justify-center px-0.5 py-1.5 text-xs font-bold transition-all duration-300 ease-in-out ${
        active
          ? "bg-gradient-to-br from-amber-50 to-amber-100/90 text-amber-950 hover:from-amber-100 hover:to-amber-200" // 預約成功：輕微金黃到琥珀色漸層，文字極深，非常好讀
          : "text-slate-700 hover:bg-slate-200/50"
      }`}
    >
      {/* 狀態標籤與小圖示 */}
      <div className="flex items-center gap-1 text-[9px] font-bold opacity-70 scale-90 text-slate-500 leading-none">
        {icon}
        <span>{label}</span>
      </div>
      
      {active ? (
        <div className="w-full flex flex-col items-center justify-center min-h-[26px]">
          <span className="w-full truncate px-0.5 text-center text-xs font-black tracking-tight text-amber-950">
            {booker}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-[26px] text-slate-400">
          <Plus className="size-3.5 stroke-[3]" /> {/* 空白時段顯示利落的加號圖示 */}
        </div>
      )}
    </button>
  )
}