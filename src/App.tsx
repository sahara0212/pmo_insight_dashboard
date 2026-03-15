/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { 
  Upload, 
  AlertTriangle, 
  FileText, 
  Activity, 
  ShieldAlert, 
  ChevronRight, 
  Loader2,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Cell
} from 'recharts';

import { auth, db, storage, signInWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  getDocs,
  limit,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

const SYSTEM_INSTRUCTION = `
너는 1,000억 원 이상의 대형 차세대 금융 시스템 구축 프로젝트를 수십 차례 성공시킨 글로벌 전략 컨설팅 펌의 시니어 파트너이자 최고 위기관리자(PMO)다.
업로드된 파편화된 현장 데이터(화이트보드, 일정표, 회의록 등)를 바탕으로, 일반적인 관리 수준을 넘어선 '입체적 전략 진단'을 수행하라.

응답은 반드시 다음 구조의 JSON 형식이어야 한다:

{
  "companyName": "가상의 혁신 금융사 명칭",
  "dashboard": {
    "overallProgress": 0~100,
    "monthlyTimeline": [
      { "month": "MM월", "planned": 0~100, "actual": 0~100 }
    ],
    "pdca": {
      "plan": "전략적 목표",
      "do": "핵심 실행 과제",
      "check": "심층 리스크 진단",
      "act": "결정적 조치 사항"
    },
    "stakeholderEngagement": {
      "businessParticipation": 0~100,
      "testReadiness": 0~100,
      "feedbackLoopSpeed": "FAST | MEDIUM | SLOW"
    }
  },
  "resourceSimulation": {
    "availablePool": [
      { "id": "res_1", "name": "공통 파트", "count": 5, "status": "COMPLETED", "skill": "Java/Spring" }
    ],
    "bottlenecks": [
      { "id": "bt_1", "name": "계정계 여신", "requiredCount": 8, "currentCount": 4, "impact": "CRITICAL" }
    ]
  },
  "steerCo": [
    // 최소 5개 이상의 아젠다를 생성하라. 긴급도(priority) 순으로 정렬하여 배치하라.
    {
      "id": "agenda_1",
      "item": "아젠다 제목",
      "priority": "CRITICAL | HIGH | MEDIUM",
      "riskWeight": 0~100,
      "description": "상세 설명",
      "options": [
        {
          "id": "opt_1",
          "label": "대응 옵션 명칭",
          "impact": "실행 시 예상되는 구체적 효과 및 리스크",
          "scheduleShift": -14, // 일정 단축(음수) 또는 지연(양수) 일수
          "resourceMove": "이동 계획"
        }
      ]
    }
  ],
  "ceoReport": "최고 경영진을 위한 입체적 전략 보고서 (마크다운)"
}

분석 가이드라인:
1. 의사결정 아젠다(SteerCo): 반드시 최소 5개 이상의 핵심 의사결정 항목을 도출하라. 각 항목은 프로젝트의 운명을 가를 수 있는 전략적 선택지여야 한다. 긴급도가 높은 순서대로 배열하라.
2. 리소스 최적화: 단순히 "사람이 부족하다"가 아니라, "어느 파트의 완료 인력을 어디로 배치하여 어떤 임팩트를 낼 것인가"를 구체적으로 제시하라.
3. 일정 시뮬레이션: 각 옵션의 'scheduleShift'는 현실적이어야 합니다. 
   - 이슈를 해결하여 일정을 단축시키는 옵션은 반드시 **음수(예: -10)**로 설정하여 전체 지연 시간을 줄이도록 하라.
   - 아무 조치도 취하지 않거나 리스크가 커지는 경우는 **양수(예: +5)**로 설정하라.
   - 사용자는 이슈 해결을 통해 현재의 지연(Baseline: 45일)이 줄어들기를 기대한다.
4. 전문적 통찰: 1,000억 프로젝트 전문가답게, 기술적 이슈 이면의 거버넌스, 정치적 리스크, 품질 안정화 기간 확보의 중요성을 강조하라.
5. 모든 실명은 가상화하라.
`;

interface AnalysisData {
  companyName: string;
  dashboard: {
    overallProgress: number;
    monthlyTimeline: { month: string; planned: number; actual: number }[];
    pdca: {
      plan: string;
      do: string;
      check: string;
      act: string;
    };
    stakeholderEngagement: {
      businessParticipation: number;
      testReadiness: number;
      feedbackLoopSpeed: 'FAST' | 'MEDIUM' | 'SLOW';
    };
  };
  resourceSimulation: {
    availablePool: { id: string; name: string; count: number; status: string; skill: string }[];
    bottlenecks: { id: string; name: string; requiredCount: number; currentCount: number; impact: string }[];
  };
  steerCo: {
    id: string;
    item: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    riskWeight: number;
    description: string;
    options: {
      id: string;
      label: string;
      impact: string;
      scheduleShift: number;
      resourceMove?: string;
    }[];
  }[];
  ceoReport: string;
}

const resizeImage = (blob: Blob, maxWidth = 1280, maxHeight = 1280): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = reject;
  });
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<{ id: string; name: string; url: string; mimeType: string }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [activeTab, setActiveTab] = useState<'steerco' | 'resources' | 'ceoreport' | 'upload'>('upload');
  const [pdcaTab, setPdcaTab] = useState<'plan' | 'do' | 'check' | 'act'>('plan');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setFiles([]);
        setAnalysisData(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    // Listen for files
    const qFiles = query(
      collection(db, 'files'), 
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubFiles = onSnapshot(qFiles, (snapshot) => {
      const fileList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setFiles(fileList);
    }, (err) => {
      console.error("Files listener error", err);
      setError("파일 목록을 가져오는데 실패했습니다.");
    });

    // Listen for latest analysis
    const qAnalysis = query(
      collection(db, 'analysis_results'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsubAnalysis = onSnapshot(qAnalysis, (snapshot) => {
      if (!snapshot.empty) {
        const data = JSON.parse(snapshot.docs[0].data().data) as AnalysisData;
        setAnalysisData(data);
        
        // Initialize options if not set
        const initialOptions: Record<string, string> = {};
        data.steerCo.forEach(item => {
          if (item.options.length > 0) initialOptions[item.id] = item.options[0].id;
        });
        setSelectedOptions(prev => Object.keys(prev).length === 0 ? initialOptions : prev);
      }
    }, (err) => {
      console.error("Analysis listener error", err);
      setError("분석 결과를 가져오는데 실패했습니다.");
    });

    return () => {
      unsubFiles();
      unsubAnalysis();
    };
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      await uploadFiles(Array.from(selectedFiles));
    }
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Compress to JPEG with 0.7 quality to significantly reduce size
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  };

  const uploadFiles = async (newFiles: File[]) => {
    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (newFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    
    const validFiles = newFiles.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
      setError("이미지 파일(jpg, png 등)만 업로드 가능합니다.");
      setIsUploading(false);
      return;
    }
    
    try {
      let completedFiles = 0;
      const totalFiles = validFiles.length;

      for (const file of validFiles) {
        // 1. Upload to Firebase Storage with progress
        const fileRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(fileRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              // Calculate overall progress: (completed files + current file progress) / total files
              const overallProgress = ((completedFiles + (fileProgress / 100)) / totalFiles) * 100;
              setUploadProgress(Math.round(overallProgress));
            }, 
            (error) => {
              reject(error);
            }, 
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              // 2. Save metadata to Firestore
              await addDoc(collection(db, 'files'), {
                name: file.name,
                url: downloadURL,
                mimeType: file.type,
                uid: user.uid,
                createdAt: new Date().toISOString()
              });
              completedFiles++;
              setUploadProgress(Math.round((completedFiles / totalFiles) * 100));
              resolve();
            }
          );
        });
      }
    } catch (err: any) {
      console.error("Upload error", err);
      setError("파일 업로드에 실패했습니다. " + err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const clearAllData = async () => {
    if (!user) return;
    if (!confirm("모든 데이터를 삭제하시겠습니까?")) return;
    
    try {
      // 1. Delete Firestore files
      const qFiles = query(collection(db, 'files'), where('uid', '==', user.uid));
      const fileDocs = await getDocs(qFiles);
      for (const d of fileDocs.docs) {
        await deleteDoc(doc(db, 'files', d.id));
      }

      // 2. Delete Firestore analysis
      const qAnalysis = query(collection(db, 'analysis_results'), where('uid', '==', user.uid));
      const analysisDocs = await getDocs(qAnalysis);
      for (const d of analysisDocs.docs) {
        await deleteDoc(doc(db, 'analysis_results', d.id));
      }

      // 3. Delete Storage files (optional, but good practice)
      const storageRef = ref(storage, `uploads/${user.uid}`);
      try {
        const listRes = await listAll(storageRef);
        for (const item of listRes.items) {
          await deleteObject(item);
        }
      } catch (e) {
        console.warn("Storage cleanup failed", e);
      }

      setFiles([]);
      setAnalysisData(null);
      setSelectedOptions({});
    } catch (err) {
      console.error("Clear error", err);
      setError("데이터 삭제에 실패했습니다.");
    }
  };

  const analyzeProject = async (retryCount: number | React.MouseEvent = 0) => {
    const actualRetryCount = typeof retryCount === 'number' ? retryCount : 0;
    if (!user || files.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // 1. Check API Key
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key가 설정되지 않았습니다. 설정 메뉴에서 API 키를 확인해 주세요.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // 2. Fetch and resize images (Client-side optimization)
      // We use a smaller max dimension to ensure we don't hit payload limits or browser timeouts
      const imageParts = await Promise.all(files.map(async (f) => {
        try {
          const response = await fetch(f.url);
          if (!response.ok) throw new Error(`이미지 로드 실패: ${f.name}`);
          const blob = await response.blob();
          
          // Resize to 1024px for better performance and lower payload
          const base64Data = await resizeImage(blob, 1024, 1024);
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          };
        } catch (err: any) {
          console.warn(`파일 처리 중 오류 (${f.name}):`, err);
          return null;
        }
      }));

      const validImageParts = imageParts.filter(p => p !== null);

      if (validImageParts.length === 0) {
        throw new Error("분석할 수 있는 유효한 이미지 데이터가 없습니다. 업로드된 파일을 확인해 주세요.");
      }

      // 3. Call Gemini API directly from the browser
      // This bypasses Vercel's server-side timeout (10s on Free plan)
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              { text: `총 ${validImageParts.length}개의 프로젝트 현장 데이터를 분석하여 통합 PMO 전략 대시보드 데이터를 생성하라. 반드시 JSON 형식으로만 응답하라. 데이터가 많으므로 핵심 위주로 요약하여 응답하라.` },
              ...validImageParts
            ]
          }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      if (!response.text) {
        throw new Error("AI로부터 응답을 받지 못했습니다. 다시 시도해 주세요.");
      }

      const data = JSON.parse(response.text) as AnalysisData;
      
      // 4. Save analysis to Firestore (After successful client-side analysis)
      await addDoc(collection(db, 'analysis_results'), {
        data: JSON.stringify(data),
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      
      setAnalysisData(data);
      const initialOptions: Record<string, string> = {};
      data.steerCo.forEach(item => {
        if (item.options.length > 0) initialOptions[item.id] = item.options[0].id;
      });
      setSelectedOptions(initialOptions);
      setActiveTab('steerco');

    } catch (err: any) {
      console.error("Analysis error details:", err);
      
      // Handle specific "Failed to fetch" error which often indicates network/timeout/CORS
      if (err.message?.includes('fetch') || err.name === 'TypeError') {
        if (actualRetryCount < 2) {
          console.log(`네트워크 오류로 인한 재시도 중... (${actualRetryCount + 1}/2)`);
          setTimeout(() => analyzeProject(actualRetryCount + 1), 2000);
          return;
        }
        setError("네트워크 연결 오류 또는 브라우저 타임아웃이 발생했습니다. 인터넷 연결을 확인하거나 데이터 양(이미지 수)을 줄여서 다시 시도해 주세요.");
      } else {
        setError(err.message || "분석 중 알 수 없는 오류가 발생했습니다.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadReport = () => {
    if (!analysisData) return;
    const blob = new Blob([analysisData.ceoReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PMO_Strategic_Report_${analysisData.companyName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalShift = useMemo(() => {
    if (!analysisData) return 0;
    let total = 0;
    Object.entries(selectedOptions).forEach(([itemId, optId]) => {
      const item = analysisData.steerCo.find(i => i.id === itemId);
      const option = item?.options.find(o => o.id === optId);
      if (option) total += option.scheduleShift;
    });
    return total;
  }, [analysisData, selectedOptions]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0B] text-slate-300">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0A0A0B]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/20">
              <Activity className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">전략적 PMO 대시보드</h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest">Enterprise Innovation Suite</p>
                <span className="text-[8px] bg-indigo-900/50 text-indigo-300 px-1 rounded border border-indigo-800/50">v2.0-FIREBASE</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-[10px] font-bold text-white">{user.displayName || user.email}</span>
                  <button onClick={logout} className="text-[9px] text-slate-500 hover:text-white uppercase tracking-tighter">로그아웃</button>
                </div>
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} className="w-8 h-8 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <button 
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                  } catch (err: any) {
                    console.error("Login error", err);
                    setError("로그인에 실패했습니다: " + (err.message || "알 수 없는 오류"));
                  }
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all"
              >
                로그인
              </button>
            )}

            {analysisData && (
              <span className="hidden sm:block text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                {analysisData.companyName}
              </span>
            )}
            
            <button
              onClick={analyzeProject}
              disabled={isAnalyzing || isUploading || files.length === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-lg transition-all shadow-lg",
                (isAnalyzing || isUploading) ? "bg-indigo-600 animate-pulse" : 
                files.length > 0 ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20" : 
                "bg-slate-800 opacity-50 cursor-not-allowed"
              )}
            >
              {(isAnalyzing || isUploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              <span className="hidden md:inline">전략 분석 실행</span>
              <span className="md:hidden">분석 실행</span>
            </button>

            <button 
              onClick={() => setActiveTab('upload')}
              className={cn(
                "p-2 rounded-lg transition-colors relative",
                activeTab === 'upload' ? "bg-slate-800 text-indigo-400" : "hover:bg-slate-800 text-slate-400"
              )}
              title="데이터 및 파일 관리"
            >
              <Upload className="w-5 h-5" />
              {files.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-[#0A0A0B]">
                  {files.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Error Message Display */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="lg:col-span-12 bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 text-red-400 text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Column: Dashboard (Fixed Sidebar style) */}
        <div className="lg:col-span-4 space-y-6">
          {analysisData ? (
            <div className="space-y-6">
              {/* Overall Progress */}
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">전체 진행률</h3>
                  <span className="text-2xl font-black text-indigo-500">{analysisData.dashboard.overallProgress}%</span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${analysisData.dashboard.overallProgress}%` }}
                    className="h-full bg-indigo-600"
                  />
                </div>
              </div>

              {/* Monthly Timeline */}
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-4 h-[260px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">프로젝트 속도 (계획 vs 실적)</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-indigo-500/40 rounded-full" />
                      <span className="text-[8px] text-slate-500 uppercase">Planned</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                      <span className="text-[8px] text-slate-500 uppercase">Actual</span>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={analysisData.dashboard.monthlyTimeline}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip 
                      cursor={{ fill: '#1e293b', opacity: 0.4 }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '10px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} 
                    />
                    <Bar 
                      dataKey="planned" 
                      fill="url(#barGradient)" 
                      radius={[4, 4, 0, 0]} 
                      barSize={20}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="actual" 
                      stroke="#6366f1" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#0f172a' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* PDCA Tabs */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-500" />
                  전략적 PDCA 거버넌스
                </h3>
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
                  <div className="flex border-b border-slate-800 bg-slate-900/80">
                    {[
                      { id: 'plan', label: 'Plan', color: 'text-blue-400' },
                      { id: 'do', label: 'Do', color: 'text-amber-400' },
                      { id: 'check', label: 'Check', color: 'text-red-400' },
                      { id: 'act', label: 'Act', color: 'text-emerald-400' }
                    ].map(step => (
                      <button
                        key={step.id}
                        onClick={() => setPdcaTab(step.id as any)}
                        className={cn(
                          "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative",
                          pdcaTab === step.id ? "text-white" : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        {step.label}
                        {pdcaTab === step.id && (
                          <motion.div 
                            layoutId="pdcaUnderline"
                            className={cn("absolute bottom-0 left-0 right-0 h-0.5", 
                              step.id === 'plan' ? 'bg-blue-500' : 
                              step.id === 'do' ? 'bg-amber-500' : 
                              step.id === 'check' ? 'bg-red-500' : 'bg-emerald-500'
                            )}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-6 min-h-[140px] flex flex-col justify-center">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={pdcaTab}
                        initial={{ opacity: 0, x: 5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-3"
                      >
                        <div className={cn(
                          "w-8 h-1 rounded-full mb-2",
                          pdcaTab === 'plan' ? 'bg-blue-500' : 
                          pdcaTab === 'do' ? 'bg-amber-500' : 
                          pdcaTab === 'check' ? 'bg-red-500' : 'bg-emerald-500'
                        )} />
                        <p className="text-sm text-slate-200 leading-relaxed font-medium italic">
                          "{analysisData.dashboard.pdca[pdcaTab]}"
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Stakeholder Engagement */}
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">이해관계자 참여도</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-500 uppercase">현업 참여도</span>
                    <div className="text-lg font-bold text-white">{analysisData.dashboard.stakeholderEngagement.businessParticipation}%</div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-500 uppercase">테스트 준비도</span>
                    <div className="text-lg font-bold text-white">{analysisData.dashboard.stakeholderEngagement.testReadiness}%</div>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase">피드백 루프</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold",
                    analysisData.dashboard.stakeholderEngagement.feedbackLoopSpeed === 'FAST' ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"
                  )}>
                    {analysisData.dashboard.stakeholderEngagement.feedbackLoopSpeed}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center space-y-4">
              <Activity className="w-12 h-12 text-slate-700" />
              <p className="text-sm text-slate-500">데이터 분석이 완료되면 <br/>대시보드가 활성화됩니다.</p>
            </div>
          )}
        </div>

        {/* Right Column: Main Content */}
        <div className="lg:col-span-8">
          <div className="min-h-[700px] rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden flex flex-col shadow-2xl">
            <AnimatePresence mode="wait">
              {isAnalyzing ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6">
                  <div className="w-20 h-20 border-4 border-slate-800 border-t-indigo-600 rounded-full animate-spin" />
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-white uppercase tracking-widest">심층 전략 분석 중...</h2>
                    <p className="text-slate-500 text-xs">1,000억 규모 프로젝트의 리스크 거버넌스를 진단하고 있습니다.</p>
                  </div>
                </motion.div>
              ) : analysisData && activeTab !== 'upload' ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col">
                  {/* Tabs */}
                  <div className="flex border-b border-slate-800 bg-slate-900/50">
                    {[
                      { id: 'steerco', label: '의사결정 아젠다', icon: ShieldAlert },
                      { id: 'resources', label: '리소스 시뮬레이션', icon: Loader2 },
                      { id: 'ceoreport', label: '전략 보고서', icon: FileText },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                          "flex-1 py-4 px-2 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-all border-b-2",
                          activeTab === tab.id 
                            ? "border-indigo-600 text-white bg-indigo-600/5" 
                            : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                        )}
                      >
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 p-8 overflow-y-auto">
                    {activeTab === 'steerco' && (
                      <div className="space-y-8">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h2 className="text-xl font-bold text-white">운영위원회(SteerCo) 아젠다</h2>
                            <p className="text-xs text-slate-500">프로젝트 성공을 위한 핵심 의사결정 항목 (긴급도 순)</p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 uppercase block">전체 일정 영향</span>
                            <span className={cn("text-2xl font-black", totalShift > 0 ? "text-red-500" : "text-emerald-500")}>
                              {totalShift > 0 ? `+${totalShift}` : totalShift} 일
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          {analysisData.steerCo.map(item => (
                            <div key={item.id} className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-6">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                      item.priority === 'CRITICAL' ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"
                                    )}>{item.priority}</span>
                                    <h3 className="text-lg font-bold text-white">{item.item}</h3>
                                  </div>
                                  <p className="text-sm text-slate-400">{item.description}</p>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-500 uppercase block">리스크 가중치</span>
                                  <span className="text-lg font-mono text-indigo-400">{item.riskWeight}%</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {item.options.map(opt => (
                                  <button
                                    key={opt.id}
                                    onClick={() => setSelectedOptions(prev => ({ ...prev, [item.id]: opt.id }))}
                                    className={cn(
                                      "p-4 rounded-xl border text-left transition-all relative group",
                                      selectedOptions[item.id] === opt.id 
                                        ? "bg-indigo-600 border-indigo-500 text-white shadow-xl" 
                                        : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600"
                                    )}
                                  >
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="font-bold text-sm">{opt.label}</span>
                                      <span className="text-[10px] font-mono">{opt.scheduleShift > 0 ? `+${opt.scheduleShift}일` : `${opt.scheduleShift}일`}</span>
                                    </div>
                                    <p className="text-[11px] opacity-80">{opt.impact}</p>
                                    {opt.resourceMove && (
                                      <div className="mt-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-tighter">
                                        <Activity className="w-3 h-3" />
                                        {opt.resourceMove}
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === 'resources' && (
                      <div className="space-y-8">
                        {/* Schedule Impact Comparison */}
                        <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-6">
                          <div className="space-y-1">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Activity className="w-4 h-4 text-indigo-500" />
                              핵심 이슈 해결 시뮬레이션
                            </h3>
                            <p className="text-[10px] text-slate-500">의사결정 아젠다의 크리티컬 이슈 해결 시 예상되는 일정 회복 시뮬레이션</p>
                          </div>
                          
                          <div className="space-y-8">
                            {/* As-Is */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] uppercase font-bold">
                                <span className="text-slate-500">As-Is: 현재 지연 (이슈 미해결 시)</span>
                                <span className="text-red-400">+45 일</span>
                              </div>
                              <div className="h-4 bg-slate-800 rounded-full overflow-hidden relative">
                                <div className="absolute inset-0 bg-red-500/20 w-full" />
                                <div className="h-full bg-red-500 w-[80%] relative z-10" />
                              </div>
                            </div>

                            {/* To-Be */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] uppercase font-bold">
                                <span className="text-indigo-400">To-Be: 예상 지연 (이슈 해결 후)</span>
                                <span className={cn(
                                  "font-black",
                                  (45 + totalShift) < 45 ? "text-emerald-400" : "text-red-400"
                                )}>
                                  {45 + totalShift > 0 ? `+${45 + totalShift}` : 45 + totalShift} 일
                                </span>
                              </div>
                              <div className="h-8 bg-slate-800 rounded-full overflow-hidden relative border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                                <motion.div 
                                  initial={false}
                                  animate={{ width: `${Math.max(10, Math.min(100, (45 + totalShift) * 1.5))}%` }}
                                  className={cn(
                                    "h-full transition-all duration-700 ease-out",
                                    (45 + totalShift) < 45 ? "bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]" : "bg-gradient-to-r from-red-600 to-red-400"
                                  )}
                                />
                                <div className="absolute inset-y-0 left-[67%] w-px bg-white/30 z-20 border-l border-dashed" />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white uppercase tracking-tighter drop-shadow-md">
                                  {totalShift < 0 ? `🚀 ${Math.abs(totalShift)} 일 회복됨` : totalShift > 0 ? `⚠️ ${totalShift} 일 추가 지연` : "의사결정 대기 중"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 grid grid-cols-3 gap-4 border-t border-slate-800">
                            <div className="text-center">
                              <div className="text-[9px] text-slate-500 uppercase">리스크 완화 상태</div>
                              <div className="text-lg font-bold text-white">{totalShift < 0 ? '활성' : '대기'}</div>
                            </div>
                            <div className="text-center border-x border-slate-800">
                              <div className="text-[9px] text-slate-500 uppercase">회복된 일정</div>
                              <div className="text-lg font-bold text-emerald-400">{totalShift < 0 ? `${Math.abs(totalShift)}일` : '0일'}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[9px] text-slate-500 uppercase">이슈 해결 현황</div>
                              <div className="text-lg font-bold text-indigo-400">
                                {Object.keys(selectedOptions).length} / {analysisData.steerCo.length}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Available Pool */}
                          <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              완료 파트 가용 리소스
                            </h3>
                            <div className="space-y-3">
                              {analysisData.resourceSimulation.availablePool.map(res => (
                                <div key={res.id} className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center justify-between">
                                  <div>
                                    <div className="text-sm font-bold text-white">{res.name}</div>
                                    <div className="text-[10px] text-slate-500">{res.skill}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-lg font-black text-emerald-500">{res.count}명</div>
                                    <div className="text-[9px] text-slate-500 uppercase">가용 가능</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Bottlenecks */}
                          <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                              핵심 병목 구간
                            </h3>
                            <div className="space-y-3">
                              {analysisData.resourceSimulation.bottlenecks.map(bt => (
                                <div key={bt.id} className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm font-bold text-white">{bt.name}</div>
                                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded">{bt.impact}</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                      <div className="h-full bg-red-500" style={{ width: `${(bt.currentCount / bt.requiredCount) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-400">{bt.currentCount} / {bt.requiredCount}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-indigo-600/10 border border-indigo-600/20 rounded-2xl">
                          <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">전문가 PMO 인사이트</h4>
                          <p className="text-sm text-slate-300 leading-relaxed">
                            현재 완료된 파트의 인력을 병목 구간으로 재배치할 경우, 단순 인원 합산 이상의 '학습 곡선(Learning Curve)' 리스크를 고려해야 합니다. 
                            공통 파트의 인력은 시스템 전반에 대한 이해도가 높으므로, 계정계 여신 파트의 단위 테스트 및 데이터 이관 검증 단계에 투입하여 
                            기존 개발자들이 코어 로직 구현에 집중할 수 있는 환경을 조성하는 것이 최선입니다.
                          </p>
                        </div>
                      </div>
                    )}

                    {activeTab === 'ceoreport' && (
                      <div className="space-y-8">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                          <h2 className="text-2xl font-bold text-white tracking-tight">최고 경영진 전략 보고서</h2>
                          <button 
                            onClick={downloadReport}
                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/20"
                          >
                            <FileText className="w-4 h-4" />
                            보고서 다운로드 (.md)
                          </button>
                        </div>
                        <div className="markdown-body bg-slate-900/20 p-8 rounded-3xl border border-slate-800/50">
                          <Markdown>{analysisData.ceoReport}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="flex-1 flex flex-col">
                  {/* Upload Tab View */}
                  <div className="p-8 space-y-8">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-white">데이터 관리</h2>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => {
                            setIsUploading(false);
                            setIsAnalyzing(false);
                            setError(null);
                          }}
                          className="text-xs font-bold text-amber-500 uppercase hover:underline"
                        >
                          상태 초기화 (Reset)
                        </button>
                        <button 
                          onClick={clearAllData}
                          className="text-xs font-bold text-red-500 uppercase hover:underline"
                        >
                          사용자 데이터 전체 삭제
                        </button>
                      </div>
                    </div>

                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files) uploadFiles(Array.from(e.dataTransfer.files));
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center gap-4 bg-slate-900/30 hover:bg-slate-900/50 hover:border-indigo-900/50 transition-all cursor-pointer group relative overflow-hidden"
                    >
                      {isUploading && (
                        <div className="absolute inset-0 bg-indigo-600/10 flex flex-col items-center justify-center gap-4 backdrop-blur-sm z-10">
                          <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              className="h-full bg-indigo-500"
                            />
                          </div>
                          <p className="text-indigo-400 font-mono text-sm font-bold">{uploadProgress}% UPLOADING...</p>
                        </div>
                      )}
                      <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                        {isUploading ? <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /> : <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-500" />}
                      </div>
                      <div className="text-center">
                        <p className="text-slate-200 font-medium">프로젝트 현장 데이터 업로드</p>
                        <p className="text-slate-500 text-sm mt-1">화이트보드, 일정표, 회의록 사진 등 (서버에 영구 보관됩니다)</p>
                      </div>
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" multiple />
                    </div>

                    {files.length > 0 ? (
                      <div className="space-y-6">
                        <div className="p-8 bg-indigo-600/10 border border-indigo-600/20 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
                          <div className="space-y-2 text-center md:text-left">
                            <h3 className="text-lg font-bold text-white">분석 준비 완료</h3>
                            <p className="text-sm text-slate-400">총 {files.length}개의 현장 데이터가 확보되었습니다. 전략 분석을 시작할 수 있습니다.</p>
                          </div>
                          <button
                            disabled={isAnalyzing || isUploading}
                            onClick={analyzeProject}
                            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-widest shadow-xl shadow-indigo-900/40 transition-all flex items-center justify-center gap-3 whitespace-nowrap"
                          >
                            {(isAnalyzing || isUploading) ? <Loader2 className="w-6 h-6 animate-spin" /> : <Activity className="w-6 h-6" />}
                            전략 분석 실행
                          </button>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stored Raw Data ({files.length})</h3>
                          <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
                            {files.map((f, i) => (
                              <div key={i} className="aspect-square rounded-xl overflow-hidden border border-slate-800 bg-slate-900 relative group">
                                <img src={f.url} alt={f.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                  <span className="text-[8px] text-white font-mono truncate px-2">{f.name}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-12 text-center space-y-4 border border-slate-800 rounded-3xl bg-slate-900/20">
                        <FileText className="w-12 h-12 text-slate-700 mx-auto" />
                        <p className="text-sm text-slate-500">업로드된 데이터가 없습니다. <br/>위의 영역에 파일을 드래그하거나 클릭하여 업로드하세요.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-slate-800 bg-[#0A0A0B]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
            © 2026 Strategic Consulting Group. Confidential & Proprietary.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-mono text-slate-600 uppercase">Security: Enterprise Grade</span>
            <span className="text-[10px] font-mono text-slate-600 uppercase">Engine: PMO-Insight-V6</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

