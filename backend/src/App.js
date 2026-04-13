import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Camera, Upload, Loader2, Calculator, History } from "lucide-react";

// 1. Firebase 配置：使用 Vercel 的環境變數
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_KEY,
  authDomain: "android-ai-food-calories-app.firebaseapp.com",
  projectId: "android-ai-food-calories-app",
  storageBucket: "android-ai-food-calories-app.firebasestorage.app",
  messagingSenderId: "487212429987",
  appId: "1:487212429987:web:9ced58ba93aa02e7234ca6",
  measurementId: "G-2377TCTZHE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 2. Gemini AI 配置
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_KEY);

function App() {
  const [userProfile, setUserProfile] = useState({
    age: "",
    gender: "male",
    height: "",
    weight: "",
    activity: "1.2"
  });
  const [tdee, setTdee] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [foodHistory, setFoodHistory] = useState([]);

  // 計算 TDEE
  useEffect(() => {
    if (userProfile.age && userProfile.height && userProfile.weight) {
      const { age, gender, height, weight, activity } = userProfile;
      let bmr = 0;
      if (gender === "male") {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
      }
      setTdee(Math.round(bmr * parseFloat(activity)));
    }
  }, [userProfile]);

  // 從 Firebase 監聽資料
  useEffect(() => {
    const q = query(collection(db, "foodLogs"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFoodHistory(logs);
    });
    return () => unsubscribe();
  }, []);

  // 處理圖片分析
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = reader.result.split(",")[1];
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = "請辨識這張食物或營養成分表圖片，給出食物名稱、熱量(kcal)、蛋白質(g)、脂肪(g)、碳水(g)。請嚴格以 JSON 格式回傳，例如: {\"name\": \"蘋果\", \"calories\": 52, \"protein\": 0.3, \"fat\": 0.2, \"carbs\": 14}";

        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Data, mimeType: file.type } }
        ]);

        const response = await result.response;
        const text = response.text();
        const foodData = JSON.parse(text.replace(/```json|```/g, ""));

        // 存入 Firebase
        await addDoc(collection(db, "foodLogs"), {
          ...foodData,
          timestamp: new Date()
        });
      };
    } catch (error) {
      console.error("分析失敗:", error);
      alert("AI 辨識發生錯誤，請稍後再試");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-800">
      <div className="max-w-md mx-auto space-y-6">
        <header className="text-center py-4">
          <h1 className="text-3xl font-bold text-blue-600">AI 營養小助手</h1>
          <p className="text-gray-500">拍照即刻辨識熱量</p>
        </header>

        {/* 個人資料與 TDEE */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-semibold">我的 TDEE: {tdee} kcal</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="number" placeholder="年齡" className="border rounded-lg p-2"
              onChange={e => setUserProfile({...userProfile, age: e.target.value})}
            />
            <input 
              type="number" placeholder="身高(cm)" className="border rounded-lg p-2"
              onChange={e => setUserProfile({...userProfile, height: e.target.value})}
            />
            <input 
              type="number" placeholder="體重(kg)" className="border rounded-lg p-2"
              onChange={e => setUserProfile({...userProfile, weight: e.target.value})}
            />
            <select 
              className="border rounded-lg p-2"
              onChange={e => setUserProfile({...userProfile, activity: e.target.value})}
            >
              <option value="1.2">久坐 (TDEE x 1.2)</option>
              <option value="1.375">輕量活動 (TDEE x 1.375)</option>
              <option value="1.55">中度活動 (TDEE x 1.55)</option>
            </select>
          </div>
        </section>

        {/* 圖片上傳區 */}
        <section className="relative">
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-blue-300 rounded-2xl bg-blue-50 hover:bg-blue-100 cursor-pointer transition-all">
            {isAnalyzing ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="mt-2 text-blue-600 font-medium">Gemini 正在分析中...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Camera className="w-10 h-10 text-blue-500" />
                <p className="mt-2 text-blue-600 font-medium">拍照或上傳食物照片</p>
              </div>
            )}
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isAnalyzing} />
          </label>
        </section>

        {/* 今日飲食清單 */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-semibold">今日飲食清單</h2>
          </div>
          <div className="space-y-4">
            {foodHistory.length === 0 ? (
              <p className="text-gray-400 text-center py-4">尚無紀錄，快去拍照吧！</p>
            ) : (
              foodHistory.map(item => (
                <div key={item.id} className="border-b pb-3 last:border-0 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold">{item.name}</h3>
                    <p className="text-sm text-gray-500">P:{item.protein}g | F:{item.fat}g | C:{item.carbs}g</p>
                  </div>
                  <span className="text-blue-600 font-bold">+{item.calories} kcal</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
