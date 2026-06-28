"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Fuel, ChevronLeft, ChevronRight, Lock, User, X, Sun, SunMoon, CalendarDays } from "lucide-react"
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

  // 讀取上次預約的姓名紀錄 (記憶功能)
  useEffect(() => {
    const savedName = localStorage.getItem("last_booker_name")
    if (savedName) setNameInput(savedName)
  }, [pending])

  // Firebase Realtime Sync
  useEffect(() => {
    const q = query(collection(db, "vehicle_bookings"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      const data: Record<string, BookingInfo> = {}
      snap.docs.forEach((d) => {
        const v = d.data()
        const key = `${v.year}-${v.month}-${v.day}-${v.slot}`
        data[key] = { name: v.name, docId: d.id }
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
      m = 12; y -= 1
    } else if (m > 12) {
      m = 1; y += 1
    }
    setYear(y)
    setMonth(m)
  }

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
        if (!name) { setError(true); return }
        
        // 記住常用姓名
        localStorage.setItem("last_booker_name", name)
        
        const tasks: Promise<any>[] = []
        if ((bookMode === "am" || bookMode === "full") && !bookerOf(pending.day, "am")) {
          tasks.push(addDoc(collection(db, "vehicle_bookings"), { year, month, day: pending.day, slot: "am", name, createdAt: Date.now() }))
        }
        if ((bookMode === "pm" || bookMode === "full") && !bookerOf(pending.day, "pm")) {
          tasks.push(addDoc(collection(db, "vehicle_bookings"), { year, month, day: pending.day, slot: "pm", name, createdAt: Date.now() }))
        }
        await Promise.all(tasks)
      } else {
        if (code !== PASSCODE) { setError(true); return }
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
    setCode("")
    setError(false)
  }

  return (
    <div 
      className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 min-h-screen bg-gradient-to-b from-[#070d0a] to-[#121b16] text-slate-100"
      style={{ fontFamily: "'Times New Roman', 'Microsoft JhengHei', '微軟正黑體', sans-serif" }}
    >
      {/* 標頭卡片：精緻漸層與陰影 */}
      <header className="rounded-xl border-2 border-[#a3cfbb]/30 bg-gradient-to-r from-[#1b382b] to-[#0f5132] px-5 py-4 shadow-xl">
        <h1 className="text-balance text-lg font-extrabold tracking-wide text-emerald-300">
          邑菖工程顧問有限公司
        </h1>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-100/80">
          <CalendarDays className="size-3.5 text-emerald-400" />
          <span>公務車預約系統 · 即時線上登記平台</span>
        </div>
      </header>

      {/* 車牌與保養條：科技感暗色面板 */}
      <div className="flex items-stretch gap-3 overflow-hidden rounded-xl border-2 border-emerald-800/60 bg-[#16251d] p-3 shadow-md">
        <div className="flex flex-1 flex-col justify-center gap-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-wider text-[#39ff14] drop-shadow-[0_0_6px_rgba(57,255,20,0.4)]">
              AJP-9973
            </span>
            <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-700/50">95無鉛</span>
            <Fuel className="size-4 text-orange-400 animate-pulse" />
          </div>
          <div className="text-[11px] font-medium text-slate-300 mt-1">下次保養里程：<span className="text-amber-400 font-bold">129,526 KM</span></div>
          <div className="text-[11px] font-medium text-slate-300">下次定檢日期：<span className="text-emerald-400 font-bold">2026/12/27</span></div>
          <div className="text-[10px] text-slate-400 leading-tight mt-0.5 border-t border-slate-700/40 pt-1">
            保養廠：祥盛汽車 (新竹市經國路一段388之3號)
            電話：03-5353897
          </div>
        </div>
        <img
          src="/images/ajp-9973.jpg"
          alt="公務車"
          className="w-1/4 shrink-0 self-center rounded-lg object-cover bg-neutral-900 border border-slate-700 min-h-[65px]"
        />
      </div>

      {/* 日曆主體：磨砂深綠質感面板 */}
      <section className="overflow-hidden rounded-xl border-2 border-emerald-800/40 bg-[#13221a] p-3 shadow-2xl">
        {/* 月份切換 */}
        <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-[#0d2218] to-[#123022] px-2 py-2">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-emerald-900/40 hover:text-white border border-transparent active:scale-95"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="select-none text-base font-black tracking-widest text-emerald-300">
            {year} 年 {month} 月
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-emerald-900/40 hover:text-white border border-transparent active:scale-95"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* 星期標頭：週六日紅色高亮 */}
        <div className="mt-2.5 grid grid-cols-7 overflow-hidden rounded-md bg-[#0b1712] text-center text-xs font-bold py-1 border border-emerald-900/30">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`py-1 ${i === 5 || i === 6 ? "text-rose-400 font-black" : "text-slate-400"}`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 日期網格 */}
        <div className="mt-2 grid grid-cols-7 gap-1.5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {cells.map((day, idx) => {
            const col = idx % 7
            const weekend = col === 5 || col === 6
            if (day === null) return <div key={`empty-${idx}`} className="min-h-[105px]" />

            const today = new Date()
            const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
            const holiday = getHolidayName(year, month, day)
            const isOff = weekend || !!holiday
            
            const am = bookerOf(day, "am")
            const pm = bookerOf(day, "pm")
            const booked = !!am || !!pm

            return (
              <div
                key={`${year}-${month}-${day}`}
                className={`relative flex min-h-[105px] flex-col overflow-hidden rounded-lg border-2 transition-all duration-300 ease-out
                  hover:-translate-y-0.5 hover:shadow-lg hover:z-10
                  ${isToday ? "border-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)] z-10 bg-[#162a35]" : 
                    booked ? "border-amber-600/70 bg-[#221c12]" : 
                    isOff ? "border-rose-900/40 bg-[#241516]" : "border-emerald-900/30 bg-[#18271f]"}`}
              >
                {/* 上方日期條 */}
                <div className={`px-1.5 py-0.5 flex flex-col items-center border-b justify-center ${
                  isToday ? "border-sky-900/50 bg-sky-950/40" :
                  isOff ? "border-rose-950/50 bg-rose-950/20" : "border-emerald-950/50 bg-emerald-950/30"
                }`}>
                  <span className={`text-xs font-extrabold ${isToday ? "text-sky-400" : isOff ? "text-rose-400" : "text-slate-200"}`}>
                    {day}
                  </span>
                  <span className="block h-2.5 truncate text-[8px] font-bold text-rose-400 scale-90 origin-center">
                    {holiday ?? ""}
                  </span>
                </div>

                {/* 時段預約區 */}
                <div className="flex flex-1 flex-col">
                  <SlotArea label="上午" icon={<Sun className="size-2 text-amber-500/60" />} booker={am} onBook={() => requestBook(day, "am")} onCancel={() => requestCancel(day, "am", am)} />
                  <div className="h-[1px] bg-slate-800/30" />
                  <SlotArea label="下午" icon={<SunMoon className="size-2 text-indigo-400/60" />} booker={pm} onBook={() => requestBook(day, "pm")} onCancel={() => requestCancel(day, "pm", pm)} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <p className="py-1 text-center text-[11px] text-slate-500 tracking-wide">
        左右滑動切換月份；點擊時段預約，取消密碼 1234
      </p>

      {/* 彈窗：精緻暗色毛玻璃卡片 */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in" onClick={closeModal}>
          <div className="w-full max-w-xs rounded-xl border-2 border-emerald-800/60 bg-[#14241c] p-5 text-slate-100 shadow-2xl animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-emerald-900/50 pb-2">
              <h2 className="flex items-center gap-1.5 text-sm font-black text-emerald-400">
                {pending.kind === "book" ? <><User className="size-4" />預約登記</> : <><Lock className="size-4" />取消預約</>}
              </h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
                <X className="size-5" />
              </button>
            </div>

            {pending.kind === "book" ? (
              <>
                <p className="mt-3 text-xs text-slate-300 leading-relaxed">
                  日期：<span className="font-bold text-amber-400">{`${year}/${month}/${pending.day}`}</span><br />
                  請選取預約時段並填寫姓名。
                </p>

                <div className="mt-3 grid grid-cols-3 gap-2">
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
                        onClick={() => { setBookMode(m); setError(false) }}
                        className={`rounded-lg border-2 py-1.5 text-xs font-bold transition-all ${
                          disabled ? "border-transparent bg-slate-900 text-slate-600 cursor-not-allowed opacity-40" :
                          selected ? "border-amber-500 bg-amber-500 text-amber-950 font-black shadow-md shadow-amber-500/20" :
                          "border-emerald-800 bg-[#193226] text-emerald-300 hover:bg-emerald-800/50"
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
                  onChange={(e) => { setNameInput(e.target.value); setError(false) }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirm() }}
                  placeholder="請輸入姓名"
                  className="mt-3.5 w-full rounded-lg border-2 border-emerald-800 bg-[#0d1813] px-3 py-2 text-center text-sm text-emerald-300 outline-none focus:border-emerald-500 transition-all placeholder:text-slate-600 font-bold"
                />
                {error && <p className="mt-1.5 text-[11px] font-bold text-rose-400">請填寫預約同仁姓名！</p>}
              </>
            ) : (
              <>
                <p className="mt-3 text-xs text-slate-300 leading-relaxed">
                  取消 <span className="font-bold text-emerald-400">{`${year}/${month}/${pending.day}`}</span> 的預約：<br />
                  使用同仁：<span className="font-extrabold text-amber-400">{pending.name}</span>
                </p>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(false) }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirm() }}
                  placeholder="請輸入四位密碼"
                  className="mt-3.5 w-full rounded-lg border-2 border-emerald-800 bg-[#0d1813] px-3 py-2 text-center text-base tracking-[0.3em] text-amber-400 outline-none focus:border-emerald-500 transition-all placeholder:text-slate-600 font-bold"
                />
                {error && <p className="mt-1.5 text-[11px] font-bold text-rose-400">管制密碼錯誤！</p>}
              </>
            )}

            <div className="mt-4 flex gap-2 pt-2 border-t border-emerald-900/30">
              <button type="button" onClick={closeModal} className="flex-1 rounded-lg border-2 border-emerald-800 bg-transparent py-1.5 text-xs font-bold text-slate-400 hover:bg-emerald-950/50">
                返回
              </button>
              <button type="button" onClick={confirm} className={`flex-1 rounded-lg py-1.5 text-xs font-black text-slate-950 shadow-md ${
                pending.kind === "book" ? "bg-emerald-400 hover:bg-emerald-300" : "bg-rose-400 hover:bg-rose-300"
              }`}>
                {pending.kind === "book" ? "確認登記" : "確認取消"}
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
      className={`flex flex-1 flex-col items-center justify-center py-1 transition-all ${
        active ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" : "text-emerald-500/60 hover:bg-emerald-900/20"
      }`}
    >
      <div className="flex items-center gap-0.5 text-[8px] opacity-40 font-bold scale-90">
        {icon}
        <span>{label}</span>
      </div>
      {active ? (
        <span className="text-center text-[11px] font-black tracking-tight text-amber-400 py-0.5 max-w-[50px] truncate">
          {booker}
        </span>
      ) : (
        <span className="text-[10px] text-slate-600/60 font-light py-0.5">+</span>
      )}
    </button>
  )
}