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

  // Firebase sync
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
            year,
            month,
            day: pending.day,
            slot: "am",
            name,
            createdAt: Date.now(),
          })
        )
      }

      if ((bookMode === "pm" || bookMode === "full") && !bookerOf(pending.day, "pm")) {
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
    } else {
      if (code !== PASSCODE) {
        setError(true)
        return
      }

      const targetDocId = bookings[`${year}-${month}-${pending.day}-${pending.slot}`]?.docId
      if (targetDocId) {
        await deleteDoc(doc(db, "vehicle_bookings", targetDocId))
      }
    }

    closeModal()
  }

  function closeModal() {
    setPending(null)
    setNameInput("")
    setCode("")
    setError(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 min-h-screen text-slate-100">

      {/* Header */}
      <header className="rounded-lg border bg-white px-5 py-4 shadow-sm">
        <h1 className="text-lg font-bold text-emerald-800">
          公務車預約系統
        </h1>
      </header>

      {/* Calendar */}
      <section className="rounded-xl border-4 bg-slate-900 p-3">

        {/* Month control */}
        <div className="flex justify-between bg-emerald-600 px-2 py-2 text-white">
          <button onClick={() => changeMonth(-1)}>
            <ChevronLeft />
          </button>
          <span>{year} / {month}</span>
          <button onClick={() => changeMonth(1)}>
            <ChevronRight />
          </button>
        </div>

        {/* Weekday */}
        <div className="grid grid-cols-7 text-center text-sm font-bold bg-emerald-800 text-white">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={i >= 5 ? "text-red-400" : ""}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1.5 mt-2">
          {cells.map((day, idx) => {
            const col = idx % 7
            const weekend = col >= 5

            if (!day) {
              return <div key={idx} className="h-[100px]" />
            }

            const am = bookerOf(day, "am")
            const pm = bookerOf(day, "pm")
            const booked = !!am || !!pm

            const isActiveBooking =
              pending?.kind === "book" && pending.day === day

            return (
              <div
                key={`${year}-${month}-${day}`}
                className={`relative flex flex-col border-2 bg-white min-h-[100px]
                  ${
                    isActiveBooking
                      ? "border-lime-400 ring-2 ring-lime-300"
                      : booked
                        ? "border-orange-500"
                        : weekend
                          ? "border-red-300 bg-red-50"
                          : "border-slate-200"
                  }
                `}
              >

                {/* Date */}
                <div className="text-center font-bold">
                  {day}
                </div>

                {/* Slots */}
                <button onClick={() => requestBook(day, "am")}>
                  AM {am || "空"}
                </button>
                <button onClick={() => requestBook(day, "pm")}>
                  PM {pm || "空"}
                </button>

              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}