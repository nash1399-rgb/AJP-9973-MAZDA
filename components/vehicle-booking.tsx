"use client"

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
import { useEffect, useMemo, useRef, useState } from "react"
import { Fuel, ChevronLeft, ChevronRight, Lock, User, X } from "lucide-react"
import { getHolidayName } from "@/lib/holidays"

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]
const PASSCODE = "1234"

type Slot = "am" | "pm"
type BookMode = "am" | "pm" | "full"

type Pending =
  | { kind: "book"; day: number }
  | { kind: "cancel"; day: number; slot: Slot; name: string }

export function VehicleBooking() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(6)

  const [bookings, setBookings] = useState<Record<string, string>>({})

  const [pending, setPending] = useState<Pending | null>(null)
  const [bookMode, setBookMode] = useState<BookMode>("am")
  const [nameInput, setNameInput] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState(false)

  const touchStartX = useRef<number | null>(null)

  // =========================
  // 🔥 Firestore Sync
  // =========================
  useEffect(() => {
    const q = query(
      collection(db, "vehicle_bookings"),
      orderBy("createdAt", "desc")
    )

    const unsub = onSnapshot(q, (snap) => {
      const data: Record<string, string> = {}

      snap.docs.forEach((d) => {
        const v = d.data()
        const key = `${v.year}-${v.month}-${v.day}-${v.slot}`
        data[key] = v.name
      })

      setBookings(data)
    })

    return () => unsub()
  }, [])

  const { firstWeekday, daysInMonth } = useMemo(() => {
    const first = new Date(year, month - 1, 1).getDay()
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
    return bookings[keyOf(day, slot)] || ""
  }

  function changeMonth(delta: number) {
    let m = month + delta
    let y = year

    if (m < 1) {
      m = 12
      y--
    } else if (m > 12) {
      m = 1
      y++
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

  function requestBook(day: number) {
    setPending({ kind: "book", day })
    setNameInput("")
    setError(false)
  }

  function requestCancel(day: number, slot: Slot, name: string) {
    setPending({ kind: "cancel", day, slot, name })
    setCode("")
    setError(false)
  }

  // =========================
  // 🔥 MAIN ACTION
  // =========================
  async function confirm() {
    if (!pending) return

    try {
      // ================= BOOK =================
      if (pending.kind === "book") {
        const name = nameInput.trim()
        if (!name) {
          setError(true)
          return
        }

        const tasks: Promise<any>[] = []

        if (bookMode === "am" || bookMode === "full") {
          tasks.push(
            addDoc(collection(db, "vehicle_bookings"), {
              year,
              month,
              day: pending.day,
              slot: "am",
              name,
              createdAt: Date.now(),
            })
          )
        }

        if (bookMode === "pm" || bookMode === "full") {
          tasks.push(
            addDoc(collection(db, "vehicle_bookings"), {
              year,
              month,
              day: pending.day,
              slot: "pm",
              name,
              createdAt: Date.now(),
            })
          )
        }

        await Promise.all(tasks)
      }

      // ================= CANCEL =================
      if (pending.kind === "cancel") {
        if (code !== PASSCODE) {
          setError(true)
          return
        }

        // 找到要刪的 doc
        const targetKey = `${year}-${month}-${pending.day}-${pending.slot}`

        const q = query(collection(db, "vehicle_bookings"))
        const snap = await new Promise<any>((resolve) => {
          const unsub = onSnapshot(q, (s) => {
            unsub()
            resolve(s)
          })
        })

        const target = snap.docs.find((d: any) => {
          const v = d.data()
          return `${v.year}-${v.month}-${v.day}-${v.slot}` === targetKey
        })

        if (target) {
          await deleteDoc(doc(db, "vehicle_bookings", target.id))
        }
      }

      closeModal()
    } catch (err) {
      console.error(err)
    }
  }

  function closeModal() {
    setPending(null)
    setNameInput("")
    setCode("")
    setError(false)
  }

  const monthBookerName =
    pending?.kind === "cancel" ? pending.name : ""

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4">

      {/* HEADER */}
      <header className="rounded-lg border bg-white px-5 py-4 shadow-sm">
        <h1 className="text-lg font-bold">公務車預約系統</h1>
      </header>

      {/* CALENDAR */}
      <section className="rounded-xl border bg-white p-3">

        <div className="flex justify-between">
          <button onClick={() => changeMonth(-1)}>
            <ChevronLeft />
          </button>

          <div className="font-bold">
            {year} / {month}
          </div>

          <button onClick={() => changeMonth(1)}>
            <ChevronRight />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-sm font-bold mt-2">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 mt-2" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} />

            const am = bookerOf(day, "am")
            const pm = bookerOf(day, "pm")

            return (
              <div key={i} className="border p-1 text-xs">

                <div className="font-bold text-center">{day}</div>

                <button onClick={() => am ? requestCancel(day, "am", am) : requestBook(day)}>
                  AM {am || "空"}
                </button>

                <button onClick={() => pm ? requestCancel(day, "pm", pm) : requestBook(day)}>
                  PM {pm || "空"}
                </button>

              </div>
            )
          })}
        </div>
      </section>

      {/* MODAL */}
      {pending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-4 rounded">

            {pending.kind === "book" ? (
              <>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="姓名"
                />
              </>
            ) : (
              <>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="密碼"
                />
                <div>取消 {monthBookerName}</div>
              </>
            )}

            {error && <div className="text-red-500 text-sm">錯誤</div>}

            <button onClick={confirm}>確認</button>
            <button onClick={closeModal}>關閉</button>
          </div>
        </div>
      )}
    </div>
  )
}