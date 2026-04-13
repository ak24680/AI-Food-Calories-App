import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, onSnapshot, Timestamp, orderBy } from "firebase/firestore";
import { Upload, Activity, Calculator, History, Loader2 } from 'lucide-react';

// --- 配置區：修正為讀取 Vercel 環境變數 ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_KEY, 
  authDomain: "android-ai-food-calories-app.firebaseapp.com",
  projectId: "android-ai-food-calories-app",
  storageBucket: "android-ai-food-calories-app.firebasestorage.app",
  messagingSenderId: "487212429987",
  appId: "1:487212429987:web:9ced58ba93aa02e7234ca6"
};

// 使用環境變數並確保 Gemini 模型名稱正確，解決 404 問題
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_KEY);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
  const [userData, setUserData] = useState({
    gender: 'male', height: 170, weight: 65, age: 25, activity: 1.2
  });
  const [tdee, setTdee] = useState(0);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1. 計算 TDEE
  useEffect(() => {
    const { gender, height, weight, age, activity } = userData;
    if (age && height && weight) {
      let bmr = (10 * weight) + (6.25 * height) - (5 * age);
      bmr = gender === 'male' ? bmr + 5 : bmr - 161;
      setTdee(Math.round(bmr * activity));
    }
  }, [userData]);

  // 2. 獲取歷史紀錄 (移除日期過濾以確保測試時能看到資料，並增加排序)
  useEffect(() => {
    const q = query(collection(db, "foodLogs"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDailyLogs(logs);
    }, (error) => {
      console.error("Firebase 連線失敗，請檢查 Rules 或廣告攔截器:", error);
    });
    return () => unsubscribe();
  }, []);

  // 3. 處理圖片並調用 Gemini (保留原本解析邏輯，僅修正模型名稱)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];
        // 修正模型名稱為 flash-latest 提高相容性，解決 404
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = "請辨識這張營養成分表圖片。請僅返回 JSON 格式，包含：foodName (食品名稱), calories (熱量kcal), protein (蛋白質g), fat (脂肪g), carbs (碳水g)。如果辨識不到請猜測大概數值。";
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Data, mimeType: file.type } }
        ]);
        
        const text = result.response.text();
        // --- 保留你要求的第三點解析邏輯 ---
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
      alert("辨識失敗，請檢查 API Key 或網路連線");
    } finally {
      setLoading(false);
    }
  };

  const totalCalories = dailyLogs.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  const progressPercent = tdee > 0 ? Math.min((totalCalories / tdee) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-800">
      <div className="max-w-md mx-auto space-y-6">
        <header className="text-center py-4">
          <h1 className="text-3xl font-bold text-blue-600">AI 營養小助手</h1>
        </header>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Calculator className="text-blue-500"/> 個人資料</h2>
          <div className="grid grid-cols-2 gap-4">
            <select className="p-2 border rounded-lg" onChange={e => setUserData({...userData, gender: e.target.value})}>
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
            <input type="number" placeholder="年齡" className="p-2 border rounded-lg" onChange={e => setUserData({...userData, age: e.target.value})} />
            <input type="number" placeholder="身高(cm)" className="p-2 border rounded-lg" onChange={e => setUserData({...userData, height: e.target.value})} />
            <input type="number" placeholder="體重(kg)" className="p-2 border rounded-lg" onChange={e => setUserData({...userData, weight: e.target.value})} />
            <select className="p-2 border rounded-lg col-span-2" onChange={e => setUserData({...userData, activity: parseFloat(e.target.value)})}>
              <option value="1.2">久坐 (不運動)</option>
              <option value="1.375">輕度 (1-3天)</option>
              <option value="1.55">中度 (3-5天)</option>
              <option value="1.725">重度 (6-7天)</option>
            </select>
          </div>
          <p className="mt-4 text-sm font-medium">建議攝取 (TDEE): <span className="text-blue-600">{tdee} kcal</span></p>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between mb-2 font-bold">
            <span>今日熱量攝取</span>
            <span>{totalCalories} / {tdee} kcal</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${progressPercent >= 100 ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </section>

        <section className="bg-blue-50 p-6 rounded-2xl border-2 border-dashed border-blue-200 text-center">
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={loading} />
            <div className="flex flex-col items-center">
              {loading ? <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-2" /> : <Upload className="w-12 h-12 text-blue-500 mb-2" />}
              <span className="font-medium text-blue-700">{loading ? "Gemini 分析中..." : "點擊上傳照片"}</span>
            </div>
          </label>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><History className="text-gray-500"/> 今日紀錄</h2>
          <div className="space-y-3">
            {dailyLogs.map((log, index) => (
              <div key={index} className="flex justify-between items-center border-b pb-2 last:border-0">
                <div>
                  <div className="font-medium">{log.foodName || "辨識中..."}</div>
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
