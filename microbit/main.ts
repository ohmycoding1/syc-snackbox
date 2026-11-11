/**
 * 스마트 잠금 상자 — 블루투스 버전 (micro:bit V2 권장)
 *
 * [준비]
 *  1. MakeCode(makecode.microbit.org)에서 "새 프로젝트"
 *  2. 확장 → "bluetooth" 추가 ("radio를 제거할까요?"가 나오면 제거)
 *     ※ 와이파이(iot) 확장은 넣지 마세요.
 *  3. 오른쪽 위 ⚙️ → "프로젝트 설정" → Bluetooth 항목에서
 *     "No Pairing Required: Anyone can connect via Bluetooth." 선택 → 저장
 *  4. JavaScript 탭에 이 코드를 통째로 붙여넣기 → 다운로드
 *  5. 서보모터 → P1 (iot:bit 보드를 쓰면 보드 USB 전원 + ON)
 *
 * [웹앱]
 *  Chrome(PC·안드로이드)에서 웹앱을 열고 "보관함 연결" → "BBC micro:bit [....]" 선택
 *  아이폰은 Bluefy 앱에서 웹앱 주소를 열어야 함
 *
 * [사용법]
 *  - 처음 켜면 "비밀번호 설정 모드" : A/B 버튼을 4번 눌러 비밀번호 저장 → 자동 잠금
 *  - 잠긴 상태 : A/B 4번 입력 → 맞으면 서보가 돌아가며 열림
 *  - A+B 동시에 : 입력 중이던 것 지우기
 *  - 열린 상태 : A = 다시 잠그기 / A+B = 비밀번호 새로 설정 (B는 무시)
 *  - 3번 연속 틀리면 30초 동안 경보(입력 잠금) + 웹앱에 경보 전송
 *  - 웹앱이 연결되면 LED 왼쪽 위 점이 켜짐
 *  - 소리는 웹앱에서만 남 (블루투스와 소리를 같이 쓰면 메모리가 부족해 마이크로비트가
 *    오류 화면을 띄우고 재시작되는 문제가 있어서 마이크로비트 소리는 뺐음)
 *
 * [웹앱과의 약속] 한 줄에 메시지 하나
 *  보관함 → 앱 : boot, hello, setup, pwset, locked, press:2/4, ok, fail:1,
 *               alarm, tamper, clear, alive:locked (5초마다), state:locked
 *  앱 → 보관함 : ping (상태 다시 보내기), lock (열려 있을 때 잠그기)
 */

// ===================== [설정] =====================
let PW_LENGTH = 4                   // 비밀번호 길이 (웹앱의 PW_LENGTH와 같게)
let MAX_FAIL = 3                    // 이 횟수만큼 틀리면 경보
let ALARM_TIME = 30000              // 경보 지속 시간(ms)
let LOCK_ANGLE = 0                  // 잠금 각도
let OPEN_ANGLE = 90                 // 열림 각도
let HEARTBEAT = 5000                // 살아있음 신호 간격(ms)
// ==================================================

let MODE_SETUP = 0
let MODE_LOCKED = 1
let MODE_OPEN = 2
let MODE_ALARM = 3

let mode = MODE_SETUP
let password = ""
let inputKeys = ""
let failCount = 0
let alarmEndTime = 0
let lastHeartbeat = 0
let connected = false
let bootSent = false          // 켜진 뒤 첫 연결 때 "boot"를 한 번 보냄 → 웹앱이 재시작을 알아챔

let outQueue: string[] = []   // 보낼 메시지 대기열 (버튼 처리가 통신 때문에 멈추지 않도록)
let keyQueue: string[] = []   // 눌린 버튼 대기열 (A, B, C=지우기)

// 연결돼 있을 때만 보냄 (연결 안 됐을 때 쌓아 두지 않음 — 연결되면 현재 상태를 새로 보냄)
function sendLine(msg: string) {
    if (connected) {
        outQueue.push(msg)
    }
}

function modeName(): string {
    if (mode == MODE_SETUP) {
        return "setup"
    }
    if (mode == MODE_LOCKED) {
        return "locked"
    }
    if (mode == MODE_OPEN) {
        return "open"
    }
    return "alarm"
}

function sendState() {
    sendLine("state:" + modeName())
}

// ---------------- 화면 ----------------
function showLinkDot() {
    if (connected) {
        led.plot(0, 0)
    }
}

function showInputDots() {
    basic.clearScreen()
    for (let i = 0; i < inputKeys.length; i++) {
        led.plot(i, 2)
    }
    showLinkDot()
}

function showModeIcon() {
    if (mode == MODE_SETUP) {
        basic.showString("SET")
        basic.showLeds(`
            . . . . .
            . . . . .
            . # # # .
            . . . . .
            . . . . .
            `)
    } else if (mode == MODE_LOCKED) {
        basic.showIcon(IconNames.Square)
    } else if (mode == MODE_OPEN) {
        basic.showIcon(IconNames.Yes)
    } else {
        basic.showIcon(IconNames.No)
    }
    showLinkDot()
}

// ---------------- 동작 ----------------
function lockBox() {
    pins.servoWritePin(AnalogPin.P1, LOCK_ANGLE)
    mode = MODE_LOCKED
    inputKeys = ""
    sendLine("locked")
    sendState()
    showModeIcon()
}

function openBox() {
    pins.servoWritePin(AnalogPin.P1, OPEN_ANGLE)
    mode = MODE_OPEN
    inputKeys = ""
    failCount = 0
    sendLine("ok")
    sendState()
    showModeIcon()
}

function startSetup() {
    pins.servoWritePin(AnalogPin.P1, OPEN_ANGLE)
    mode = MODE_SETUP
    inputKeys = ""
    sendLine("setup")
    sendState()
    showModeIcon()
}

function startAlarm() {
    mode = MODE_ALARM
    inputKeys = ""
    alarmEndTime = input.runningTime() + ALARM_TIME
    sendLine("alarm")
    sendState()
    showModeIcon()
}

function savePassword() {
    password = inputKeys
    inputKeys = ""
    sendLine("pwset")
    basic.showIcon(IconNames.Heart)
    basic.pause(500)
    basic.showString(password)   // 저장된 비밀번호를 한 번 확인시켜 줌
    keyQueue = []                // 확인하는 동안 눌린 버튼은 버림
    lockBox()
}

function checkPassword() {
    if (inputKeys == password) {
        openBox()
    } else {
        failCount = failCount + 1
        inputKeys = ""
        sendLine("fail:" + failCount)
        basic.showIcon(IconNames.Sad)
        if (failCount >= MAX_FAIL) {
            startAlarm()
        } else {
            basic.pause(500)
            keyQueue = []
            showModeIcon()
        }
    }
}

// 버튼 하나를 처리 (key = "A" 또는 "B")
function pressKey(key: string) {
    if (mode == MODE_ALARM) {
        sendLine("tamper")
        return
    }
    if (mode == MODE_OPEN) {
        if (key == "A") {
            lockBox()
        }
        return
    }

    inputKeys = inputKeys + key
    showInputDots()

    if (mode == MODE_SETUP) {
        if (inputKeys.length >= PW_LENGTH) {
            savePassword()
        }
        return
    }

    // 잠긴 상태 : 어떤 버튼인지는 보내지 않고 "몇 번째 입력인지"만 보냄 (비밀번호 노출 방지)
    sendLine("press:" + inputKeys.length + "/" + PW_LENGTH)
    if (inputKeys.length >= PW_LENGTH) {
        checkPassword()
    }
}

input.onButtonPressed(Button.A, function () {
    keyQueue.push("A")
})
input.onButtonPressed(Button.B, function () {
    keyQueue.push("B")
})
input.onButtonPressed(Button.AB, function () {
    keyQueue.push("C")
})

// 줄 서 있는 버튼 입력을 순서대로 하나씩 처리
basic.forever(function () {
    if (keyQueue.length == 0) {
        basic.pause(20)
        return
    }
    let key = keyQueue.shift()
    if (key == "C") {
        if (mode == MODE_ALARM) {
            sendLine("tamper")
        } else if (mode == MODE_OPEN) {
            startSetup()
        } else {
            inputKeys = ""
            sendLine("clear")
            showModeIcon()
        }
    } else {
        pressKey(key)
    }
})

// ---------------- 블루투스 ----------------
bluetooth.startUartService()

bluetooth.onBluetoothConnected(function () {
    connected = true
    outQueue = []
    if (!bootSent) {
        bootSent = true
        sendLine("boot")
    }
    sendLine("hello")
    sendState()
    sendLine("alive:" + modeName())
    led.plot(0, 0)
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    outQueue = []
    led.unplot(0, 0)
})

// 웹앱에서 오는 명령 (한 줄씩)
bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let cmd = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    if (cmd.includes("ping")) {
        // 확인 요청 : 줄 맨 앞에 끼워 넣어 바로 답장
        if (connected) {
            outQueue.unshift("state:" + modeName())
            outQueue.unshift("alive:" + modeName())
        }
    } else if (cmd.includes("lock")) {
        if (mode == MODE_OPEN) {
            keyQueue.push("A")   // 열린 상태의 A 버튼과 똑같이 처리 (잠그기)
        }
    }
})

// ---------------- 반복 : 메시지 전송 + 경보 해제 + 생존 신호 ----------------
basic.forever(function () {
    // 경보 시간이 끝나면 다시 잠금 상태로
    if (mode == MODE_ALARM && input.runningTime() > alarmEndTime) {
        failCount = 0
        lockBox()
    }

    // 5초마다 "살아있음" 신호
    if (connected && input.runningTime() - lastHeartbeat > HEARTBEAT) {
        lastHeartbeat = input.runningTime()
        sendLine("alive:" + modeName())
    }

    // 대기열에 쌓인 메시지를 하나씩 전송
    if (connected && outQueue.length > 0) {
        bluetooth.uartWriteLine(outQueue.shift())
        basic.pause(30)
    } else {
        basic.pause(50)
    }
})

// ---------------- 시작 ----------------
pins.servoWritePin(AnalogPin.P1, OPEN_ANGLE)
keyQueue = []
startSetup()
