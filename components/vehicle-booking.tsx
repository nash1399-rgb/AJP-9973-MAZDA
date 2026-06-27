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
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
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
    // 外層：採用與目標網站一致的純黑背景 [#0a0a0a]，基礎字色改為 slate-100
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 min-h-screen bg-[#0a0a0a] text-slate-100 font-sans">
      
      {/* Header card：深黑底色 [#121212] 與暗色細邊框 [#1f1f1f] */}
      <header className="rounded-lg border border-[#1f1f1f] bg-[#121212] px-5 py-4 shadow-sm">
        <h1 className="text-balance text-lg font-bold text-[#39ff14]">
          邑菖工程顧問有限公司－公務車預約系統
        </h1>
        <p className="mt-1 text-xs text-slate-400">線上即時預約的登記平台</p>
      </header>

      {/* License plate banner + vehicle info */}
      <div className="flex items-stretch gap-3 overflow-hidden rounded-lg border border-[#39ff14]/20 bg-[#121212] p-3 text-white shadow-inner">
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-extrabold tracking-wide text-[#39ff14]">
              AJP-9973（95無鉛汽油）
            </span>
            <Fuel className="size-5 shrink-0 text-[#39ff14]" aria-hidden="true" />
          </div>
          <div className="text-xs font-semibold text-slate-300">下次保養里程數 129526 公里</div>
          <div className="text-xs font-semibold text-slate-300">下次汽車檢驗日期 2026 年 12 月 27 日</div>
          <div className="text-[11px] leading-tight text-slate-400">保養廠：祥盛汽車-新竹市東區復興里經國路一段 388 之 3 號，電話：03-5353897</div>
        </div>
        <img
          src="/images/ajp-9973.jpg"
          alt="公務車照片"
          className="w-1/4 shrink-0 self-center rounded-md object-cover bg-neutral-800 min-h-[60px]"
        />
      </div>

      {/* Calendar */}
      <section className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#121212] p-3 shadow-2xl">
        
        {/* Calendar header */}
        <div className="flex items-center justify-between rounded-lg bg-[#1f1f1f] px-2 py-2.5">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="flex size-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-neutral-800 hover:text-[#39ff14]"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="select-none font-mono text-lg font-extrabold tracking-wide text-slate-200">
            {year} 年 {month} 月
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="flex size-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-neutral-800 hover:text-[#39ff14]"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Weekday header */}
        <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-md bg-[#1f1f1f] text-center text-sm font-semibold text-slate-300">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`border-r border-neutral-800 py-1.5 last:border-r-0 ${
                i === 5 || i === 6 ? "font-extrabold text-rose-400" : "text-slate-300"
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
            const weekend = col === 5 || col === 6 // 六與日
            
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
                className={`relative flex min-h-[110px] flex-col overflow-hidden rounded-md border transition-all duration-200 ease-out
                  hover:-translate-y-[2px] hover:shadow-md hover:z-10
                  ${
                    isToday
                      ? "border-[#39ff14] ring-2 ring-[#39ff14]/50 z-10"
                      : booked
                        ? "border-amber-500"
                        : isOff
                          ? "border-rose-900/60 ring-1 ring-rose-900/20" // 🔴 放假日/六日：紅色細框
                          : "border-[#1f1f1f]"
                  } 
                  ${isOff ? "bg-rose-950/25" : "bg-[#161616]"}`} // 🔴 放假日/六日：高質感暗紅襯底
              >
                {/* date header */}
                <div className="px-1 pt-0.5 pb-0.5 bg-[#1f1f1f]/80">
                  <div className="flex flex-col items-center">
                    <span className={`text-sm font-bold ${isOff ? "text-rose-400" : "text-[#39ff14]"}`}>
                      {day}
                    </span>
                  </div>
                  <span className="block h-3 truncate text-center text-[9px] font-semibold leading-3 text-rose-400">
                    {holiday ?? ""}
                  </span>
                </div>

                <div className="h-px bg-[#1f1f1f]" />

                {/* AM / PM Slots */}
                <div className="flex flex-1 flex-col bg-[#0f0f0f]">
                  <SlotArea
                    label="上午"
                    booker={am}
                    onBook={() => requestBook(day, "am")}
                    onCancel={() => requestCancel(day, "am", am)}
                  />
                  <div className="h-px bg-[#1f1f1f]" />
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

      <p className="py-2 text-center text-xs text-slate-500">
        《左右滑動或點箭頭切換月份；點擊時段預約，取消需輸入管制密碼1234》
      </p>

      {/* Modal 彈窗：同步調整為純黑萊姆綠配色 */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={closeModal}>
          <div className="w-full max-w-xs rounded-lg border border-[#1f1f1f] bg-[#121212] p-5 text-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-[#39ff14]">
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
              <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-300">
                <X className="size-5" />
              </button>
            </div>

            {pending.kind === "book" ? (
              <>
                <p className="mt-2 text-sm text-slate-300">
                  預約 <span className="font-bold text-[#39ff14]">{`${year}/${month}/${pending.day}`}</span>，請選擇時段並輸入姓名。
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
                        className={`rounded-md border py-2 text-sm font-semibold transition-colors ${
                          disabled
                            ? "cursor-not-allowed border-neutral-800 bg-[#0f0f0f] text-neutral-700"
                            : selected
                              ? "border-[#39ff14] bg-[#39ff14] text-black"
                              : "border-neutral-700 bg-[#1f1f1f] text-[#39ff14] hover:bg-neutral-800"
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
                  className="mt-3 w-full rounded-md border border-neutral-700 bg-[#0f0f0f] px-3 py-2 text-center text-base text-[#39ff14] outline-none focus:border-[#39ff14]"
                />
                {error && <p className="mt-1.5 text-xs font-medium text-rose-400">請輸入姓名。</p>}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-300">
                  取消 <span className="font-bold text-[#39ff14]">{`${year}/${month}/${pending.day}`}</span> 時段（{monthBookerName}），請輸入管制密碼。
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
                  className="mt-3 w-full rounded-md border border-neutral-700 bg-[#0f0f0f] px-3 py-2 text-center text-lg tracking-[0.4em] text-[#39ff14] outline-none focus:border-[#39ff14]"
                />
                {error && <p className="mt-1.5 text-xs font-medium text-rose-400">密碼錯誤，請重新輸入。</p>}
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-md border border-neutral-700 bg-[#1f1f1f] py-2 text-sm font-semibold text-slate-300 hover:bg-neutral-800"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={confirm}
                className={`flex-1 rounded-md py-2 text-sm font-semibold shadow-sm ${
                  pending.kind === "book"
                    ? "bg-[#39ff14] text-black hover:opacity-90"
                    : "bg-rose-600 text-white hover:bg-rose-700"
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
      aria-label={active ? `${label} 已由 ${booker} 預約，點擊取消` : `預約 ${label}`}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-amber-950/30 text-amber-400 hover:bg-amber-950/50"
          : "text-slate-500 hover:bg-neutral-800 hover:text-[#39ff14]"
      }`}
    >
      <span className="shrink-0 text-[9px] opacity-40 leading-none">{label}</span>
      {active ? (
        <span className="w-full truncate px-0.5 text-center text-[11px] font-bold tracking-tight text-amber-300确定">
          {booker}
        </span>
      ) : (
        <span className="text-[10px] text-neutral-700 font-normal">空</span>
      )}
    </button>
  )
}