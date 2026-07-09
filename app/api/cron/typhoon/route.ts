import { NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { collection, addDoc, getDocs, query, where } from "firebase/firestore"

// 行政院人事行政總處天然災害停止上班上課情形網址
const DGPA_URL = "https://www.dgpa.gov.tw/nds.html"

export async function GET(request: Request) {
  // 驗證是否為 Vercel Cron 安全請求 (在本地測試時，您可以暫時註解這段)
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // 1. 抓取政府停班停課網頁 HTML
    const response = await fetch(DGPA_URL, { cache: 'no-store' })
    const html = await response.text()

    // 2. 檢查是否有出現新竹縣或新竹市停班課關鍵字
    const hsinchuIndex = html.indexOf("新竹縣")
    const hsinchuCityIndex = html.indexOf("新竹市")
    
    let targetHtmlBlock = ""
    if (hsinchuIndex !== -1) {
      targetHtmlBlock = html.substring(hsinchuIndex, hsinchuIndex + 300)
    } else if (hsinchuCityIndex !== -1) {
      targetHtmlBlock = html.substring(hsinchuCityIndex, hsinchuCityIndex + 300)
    }

    // 3. 如果判定有新竹區域停止上班上課的字眼
    if (targetHtmlBlock.includes("停止上班") || targetHtmlBlock.includes("停止上課")) {
      
      // 4. 解析當前時間與可能的颱風名稱
      const today = new Date()
      const year = today.getFullYear()
      const month = today.getMonth() + 1
      const day = today.getDate()
      
      // 從 HTML 內容粗略抓取颱風名字，若抓不到則預設為「颱風」
      let typhoonName = "颱風"
      const match = html.match(/（(.*?)颱風）/) || html.match(/(.*?)颱風/)
      if (match && match[1]) {
        typhoonName = match[1].trim().substring(0, 4) // 截取前4個字
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
        // 6. 如果當天還沒有停班紀錄，自動寫入 Firebase 的全天 (full) 欄位
        await addDoc(collection(db, "vehicle_bookings"), {
          year,
          month,
          day,
          slot: "full",
          name: keyName,
          createdAt: Date.now()
        })
        return NextResponse.json({ success: true, message: `已自動同步並建立：${keyName}` })
      }
      return NextResponse.json({ success: true, message: "今天已同步過停班資訊，跳過寫入" })
    }

    return NextResponse.json({ success: true, message: "目前新竹地區照常上班上課" })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}