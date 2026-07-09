import { NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { collection, addDoc, getDocs, query, where } from "firebase/firestore"

// 行政院人事行政總處天然災害停止上班上課情形網址
const DGPA_URL = "https://www.dgpa.gov.tw/nds.html"

export async function GET(request: Request) {
  // 驗證是否為 Vercel Cron 安全請求
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // 1. 抓取政府停班停課網頁 HTML
    const response = await fetch(DGPA_URL, { cache: 'no-store' })
    const html = await response.text()

    // 2. 檢查是否有出現新竹縣停班課關鍵字 (政府官方網頁只會寫「新竹縣」，不寫竹北市)
    const hsinchuIndex = html.indexOf("新竹縣")
    
    let targetHtmlBlock = ""
    if (hsinchuIndex !== -1) {
      // 擷取新竹縣欄位後方 300 個字元的公告內容
      targetHtmlBlock = html.substring(hsinchuIndex, hsinchuIndex + 300)
    }

    // 3. 如果判定有新竹區域停止上班上課的字眼
    if (targetHtmlBlock.includes("停止上班") || targetHtmlBlock.includes("停止上課")) {
      
      // 4. 🚀 修正日期邏輯：政府晚上公告的是「明天」的颱風假
      const targetDate = new Date()
      // 如果目前執行時間是晚上 6 點 (18點) 之後，代表公告的是明天，日期自動 +1
      if (targetDate.getHours() >= 18) {
        targetDate.setDate(targetDate.getDate() + 1)
      }

      const year = targetDate.getFullYear()
      const month = targetDate.getMonth() + 1
      const day = targetDate.getDate()
      
      // 從 HTML 內容粗略抓取颱風名字
      let typhoonName = "颱風"
      const match = html.match(/（(.*?)颱風）/) || html.match(/(.*?)颱風/)
      if (match && match[1]) {
        typhoonName = match[1].trim().substring(0, 4)
      }

      const keyName = `${typhoonName} 停班停課`

      // 5. 檢查 Firebase 當天是否已經建立過這筆颱風紀錄，避免重複寫入
      const q = query(
        collection(db, "vehicle_bookings"),
        where("year", "==", year),
        where("month", "==", month),
        where("day", "==", day),
        where("slot", "==", "full")
      )
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        // 6. 自動寫入 Firebase 的全天 (full) 欄位
        await addDoc(collection(db, "vehicle_bookings"), {
          year,
          month,
          day,
          slot: "full",
          name: keyName,
          createdAt: Date.now()
        })
        return NextResponse.json({ success: true, message: `已自動同步並建立 ${year}/${month}/${day} 的紀錄：${keyName}` })
      }
      return NextResponse.json({ success: true, message: `今天已同步過 ${year}/${month}/${day} 停班資訊，跳過寫入` })
    }

    return NextResponse.json({ success: true, message: "目前新竹地區照常上班上課" })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}