import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { Upload, Activity, Calculator, History } from 'lucide-react';

// --- 配置區 (請替換成你的金鑰) ---
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
};

const genAI = new GoogleGenerativeAI("YOUR_GEMINI_API_KEY");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
  // 用戶資料狀態
  const [userData, setUserData] = useState({
    gender: 'male', height: 170, weight: 65, age: 25, activity: 1.2
  });
  const [tdee, setTdee] = useState(0);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1. 計算 TDEE (Mifflin-St Jeor Formula)
  useEffect(() => {
    const { gender, height, weight, age, activity } = userData;
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
    setTdee(Math.round(bmr * activity));
  }, [userData]);

  // 2. 獲取當天歷史紀錄
  useEffect(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const q = query(
      collection(db, "foodLogs"),
      where("timestamp", ">=", Timestamp.fromDate(today))
    );
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      setDailyLogs(logs);
    });
  }, []);

  // 3. 處理圖片並調用 Gemini
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = "請辨識這張營養成分表圖片。請僅返回 JSON 格式，包含：foodName (食品名稱), calories (熱量kcal), protein (蛋白質g), fat (脂肪g), carbs (碳水g)。如果辨識不到請猜測大概數值。";
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Data, mimeType: file.type } }
        ]);
        
        const text = result.response.text();
        const jsonMatch = text.match(/\{.*\}/s);
        if (jsonMatch) {
          const nutrition = JSON.parse(jsonMatch[0]);
          await addDoc(collection(db, "foodLogs"), {
            ...nutrition,
            timestamp: Timestamp.now()
          });
        }
      };
    } catch (error) {
      console.error("辨識失敗", error);
      alert("辨識失敗，請確保圖片清晰");
    } finally {
      setLoading(false);
    }
  };

  const totalCalories = dailyLogs.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  const progressPercent = Math.min((totalCalories / tdee) * 100, 100);

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        {/* 1. 用戶設定 */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Calculator className="text-blue-500"/> 個人資料</h2>
          <div className="grid grid-cols-2 gap-4">
            <select className="p-2 border rounded-lg" onChange={e => setUserData({...userData, gender: e.target.value})}>
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
            <input type="number" placeholder="年齡" className="p-2 border rounded-lg" onChange={e => setUserData({...userData, age: e.target.value})} />
            <input type="number" placeholder="身高 (cm)" className="p-2 border rounded-lg" onChange={e => setUserData({...userData, height: e.target.value})} />
            <input type="number" placeholder="體重 (kg)" className="p-2 border rounded-lg" onChange={e => setUserData({...userData, weight: e.target.value})} />
            <select className="p-2 border rounded-lg col-span-2" onChange={e => setUserData({...userData, activity: parseFloat(e.target.value)})}>
              <option value="1.2">久坐 (不運動)</option>
              <option value="1.375">輕度 (每週運動1-3天)</option>
              <option value="1.55">中度 (每週運動3-5天)</option>
              <option value="1.725">重度 (每週運動6-7天)</option>
            </select>
          </div>
          <p className="mt-4 text-sm text-gray-600">您的每日建議攝取 (TDEE): <span className="font-bold text-blue-600">{tdee} kcal</span></p>
        </section>

        {/* 2. 進度條 */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between mb-2">
            <span className="font-bold">今日熱量攝取</span>
            <span>{totalCalories} / {tdee} kcal</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${progressPercent > 100 ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </section>

        {/* 3. 上傳功能 */}
        <section className="bg-blue-50 p-6 rounded-2xl border-2 border-dashed border-blue-200 text-center">
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            <div className="flex flex-col items-center">
              <Upload className="w-12 h-12 text-blue-500 mb-2" />
              <span className="font-medium text-blue-700">{loading ? "Gemini 正在分析中..." : "點擊上傳營養成分圖"}</span>
            </div>
          </label>
        </section>

        {/* 4. 歷史清單 */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><History className="text-gray-500"/> 今日清單</h2>
          <div className="space-y-3">
            {dailyLogs.map((log, index) => (
              <div key={index} className="flex justify-between items-center border-b pb-2">
                <div>
                  <div className="font-medium">{log.foodName || "未命名食品"}</div>
                  <div className="text-xs text-gray-400">P:{log.protein}g | F:{log.fat}g | C:{log.carbs}g</div>
                </div>
                <div className="font-bold text-blue-600">+{log.calories} kcal</div>
              </div>
            ))}
            {dailyLogs.length === 0 && <p className="text-gray-400 text-center py-4">目前還沒有紀錄</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
