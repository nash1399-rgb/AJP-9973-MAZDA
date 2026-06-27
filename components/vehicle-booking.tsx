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

const WEEKDAYS = [ "一", "二", "三", "四", "五", "六","日"]
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
    // 這裡強制加上 bg-slate-50，避免外部環境（如深色模式切換）導致全黑
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 min-h-screen vb-dots text-slate-100">
      
      {/* Header card */}
      <header className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-balance text-lg font-bold text-emerald-800">
          邑菖工程顧問有限公司－公務車預約系統
        </h1>
        <p className="mt-1 text-xs text-slate-500">線上即時預約的登記平台</p>
      </header>

      {/* License plate banner + vehicle info */}
      <div className="flex items-stretch gap-3 overflow-hidden rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-800 p-3 text-white shadow-inner">
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-extrabold tracking-wide">
              AJP-9973（95無鉛汽油）
            </span>
            <Fuel className="size-5 shrink-0 text-orange-300" aria-hidden="true" />
          </div>
          <div className="text-xs font-semibold opacity-90">下次保養里程數 129526 公里</div>
          <div className="text-xs font-semibold opacity-90">下次汽車檢驗日期 2026 年 12 月 27 日</div>
          <div className="text-[11px] leading-tight opacity-80">保養廠：祥盛汽車-新竹市東區復興里經國路一段 388 之 3 號，電話：03-5353897</div>
        </div>
        <img
          src="/images/ajp-9973.jpg"
          alt="公務車照片"
          className="w-1/4 shrink-0 self-center rounded-md object-cover bg-emerald-700 min-h-[60px]"
        />
      </div>

      {/* Calendar */}
      <section className="overflow-hidden rounded-xl border-4 border-slate-800 bg-slate-900 p-3 shadow-lg ring-1 ring-black/20">
        
        {/* Calendar header */}
        <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-2 py-2.5 shadow-inner">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="flex size-9 items-center justify-center rounded-md bg-white/15 text-white transition-colors hover:bg-white/30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="select-none font-mono text-lg font-extrabold tracking-wide text-white">
            {year} 年 {month} 月
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="flex size-9 items-center justify-center rounded-md bg-white/15 text-white transition-colors hover:bg-white/30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Weekday header */}
        <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-md bg-emerald-800 text-center text-sm font-semibold text-white">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
             className={`border-r border-white/15 py-1.5 last:border-r-0 ${
  i === 5 || i === 6
    ? "font-extrabold text-orange-400"
    : "text-white"
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
  <div
    key={`empty-${idx}`}
    className="min-h-[110px]"
    aria-hidden="true"
  />
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
      className={`flex min-h-[110px] flex-col overflow-hidden rounded-md border shadow-sm ${
        isToday
          ? "border-blue-600 ring-4 ring-blue-500"
          : booked
            ? "border-amber-500 ring-1 ring-amber-500"
            : isOff
              ? "border-rose-200"
              : "border-slate-200"
      } ${isOff ? "bg-rose-50/70" : "bg-slate-50/50"}`}
    >
                {/* date header */}
                <div className="px-1 pt-0.5 pb-0.5 bg-white/60">
                  <span className={`block text-center text-sm font-bold leading-tight ${isOff ? "text-rose-600" : "text-emerald-800"}`}>
                    {day}
                  </span>
                  <span className="block h-3 truncate text-center text-[9px] font-semibold leading-3 text-rose-500">
                    {holiday ?? ""}
                  </span>
                </div>

                <div className="h-px bg-slate-200" />

                {/* AM / PM Slots */}
                <div className="flex flex-1 flex-col bg-white">
                  <SlotArea
                    label="上午"
                    booker={am}
                    onBook={() => requestBook(day, "am")}
                    onCancel={() => requestCancel(day, "am", am)}
                  />
                  <div className="h-px bg-slate-100" />
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

      <p className="py-2 text-center text-xs text-slate-400">
        《左右滑動或點箭頭切換月份；點擊時段預約，取消需輸入管制密碼1234》
      </p>

      {/* Modal */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeModal}>
          <div className="w-full max-w-xs rounded-lg border border-slate-200 bg-white p-5 text-slate-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-emerald-800">
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
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            {pending.kind === "book" ? (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  預約 <span className="font-bold text-emerald-700">{`${year}/${month}/${pending.day}`}</span>，請選擇時段並輸入姓名。
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
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                            : selected
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-slate-200 bg-white text-emerald-800 hover:bg-slate-50"
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
                  className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-base text-emerald-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                {error && <p className="mt-1.5 text-xs font-medium text-rose-600">請輸入姓名。</p>}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  取消 <span className="font-bold text-emerald-700">{`${year}/${month}/${pending.day}`}</span> 時段（{monthBookerName}），請輸入管制密碼。
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
                  className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-lg tracking-[0.4em] text-emerald-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                {error && <p className="mt-1.5 text-xs font-medium text-rose-600">密碼錯誤，請重新輸入。</p>}
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-md border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={confirm}
                className={`flex-1 rounded-md py-2 text-sm font-semibold text-white shadow-sm ${
                  pending.kind === "book"
                    ? "bg-emerald-600 hover:bg-emerald-700"
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
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-amber-50 text-amber-700 hover:bg-amber-100/70"
          : "text-emerald-700 hover:bg-slate-50"
      }`}
    >
      <span className="shrink-0 text-[9px] opacity-60 leading-none">{label}</span>
      {active ? (
        <span className="w-full truncate px-0.5 text-center text-[11px] font-bold tracking-tight text-amber-900">
          {booker}
        </span>
      ) : (
        <span className="text-[10px] text-slate-300 font-normal">空</span>
      )}
    </button>
  )
}