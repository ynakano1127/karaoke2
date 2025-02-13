const startButton = document.getElementById("start") as HTMLButtonElement;
const stopButton = document.getElementById("stop") as HTMLButtonElement;
const freqDisplay = document.getElementById("freq-display") as HTMLDivElement;
const canvasWaveform = document.getElementById("waveform") as HTMLCanvasElement;
const canvasFrequency = document.getElementById("frequency") as HTMLCanvasElement;

const ctxWaveform = canvasWaveform.getContext("2d")!;
const ctxFrequency = canvasFrequency.getContext("2d")!;

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaStream: MediaStream | null = null;
let dataArray: Float32Array;
let animationFrameId: number | null = null;
let recording = false;

// ローパスフィルター
let lowPassFilter: BiquadFilterNode | null = null;

// 録音開始
startButton.addEventListener("click", async () => {
    if (!audioContext) {
        audioContext = new AudioContext();
    }

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                autoGainControl: false, // 自動ゲイン調整を無効化
                noiseSuppression: false, // ノイズ抑制を無効化
                echoCancellation: false // エコーキャンセルを無効化
            }
        });
        const source = audioContext.createMediaStreamSource(mediaStream);

        // ローパスフィルターを作成（カットオフ周波数 1000Hz）
        lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = "lowpass";
        lowPassFilter.frequency.value = 1000; // 1kHz 以下を通過
        lowPassFilter.Q.value = 1.0; // フィルターの鋭さ

        const highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = "highpass";
        highPassFilter.frequency.value = 100;
        highPassFilter.Q.value = 1.0;


        analyser = audioContext.createAnalyser();
        analyser.fftSize = 32768;
        const bufferLength = analyser.fftSize;
        dataArray = new Float32Array(bufferLength);

        // オーディオノードの接続
        source.connect(lowPassFilter);
        lowPassFilter.connect(highPassFilter);
        highPassFilter.connect(analyser)

        recording = true;
        draw();
    } catch (err) {
        console.error("マイクのアクセスに失敗しました", err);
    }
});

// 録音停止
stopButton.addEventListener("click", () => {
    if (!recording) return;
    recording = false;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    mediaStream?.getTracks().forEach(track => track.stop());
});

// 自己相関関数による周波数推定（ローパスフィルター適用後）
function estimateFrequency(buffer: Float32Array, sampleRate: number): number {
    let size = buffer.length;
    let maxOffset = 44100 * 0.02; // 20ms 分のオフセット
    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = 1; offset < maxOffset; offset++) {
        let correlation = 0;

        for (let i = 0; i < maxOffset; i++) {
            correlation += buffer[i] * buffer[i + offset];
        }

        correlation /= maxOffset;

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    if (bestOffset === -1) return 0;

    return sampleRate / bestOffset;
}

let lastFreqUpdateTime = 0; 

// 波形と周波数の描画
function draw() {
    if (!analyser || !recording) return;

    animationFrameId = requestAnimationFrame(draw);

    analyser.getFloatTimeDomainData(dataArray);

    const now = Date.now(); // 現在の時間を取得

    // 周波数を100msごとに更新
    if (now - lastFreqUpdateTime >= 100) {  // 100ms 経過したら
        lastFreqUpdateTime = now;  // 更新時刻を保存

        // 周波数を推定
        const frequency = estimateFrequency(dataArray, audioContext!.sampleRate);
        freqDisplay.textContent = `周波数: ${frequency.toFixed(2)} Hz`;
    }


    // 波形を描画
    ctxWaveform.clearRect(0, 0, canvasWaveform.width, canvasWaveform.height);
    ctxWaveform.beginPath();
    ctxWaveform.strokeStyle = "lime";
    ctxWaveform.lineWidth = 2;

    const sliceWidth = canvasWaveform.width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] * 0.5 + 0.5; // Normalize [-1,1] → [0,1]
        const y = v * canvasWaveform.height;

        if (i === 0) {
            ctxWaveform.moveTo(x, y);
        } else {
            ctxWaveform.lineTo(x, y);
        }
        x += sliceWidth;
    }
    ctxWaveform.stroke();
}
