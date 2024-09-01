import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/tauri"
import { listen } from "@tauri-apps/api/event"
import { useNavigate } from "react-router-dom"
import "./index.css"

import ExecuteButton from "../_components/ExecuteButton"
import ConsoleBox from "../_components/ConsoleBox"

import SettingsIcon from "@mui/icons-material/Settings"
import {
  IconButton,
  Input,
  Button,
} from "@mui/material";

import DropDownWithArrows from "../_components/DropDownWithArrows"

import { ConfigProps } from "../types";

export default function Home() {
  const navigate = useNavigate()

  const [consoleText, setConsoleText] = useState<string>("");
  const [pid, setPid] = useState<number | null>(null);
  const [arbitraryCode, setArbitraryCode] = useState<string>("");

  const [saveDir, setSaveDir] = useState("");

  useEffect(() => {
    invoke<ConfigProps>("get_settings").then((config) => {
      setSaveDir(config.save_dir);
    });
  }, []);

  // // debug
  // useEffect(() => {
  //   setPid(0);
  // }, [])

  interface Param {
    kind: number
    url?: string
    codec_id?: string
    options?: string
  }

  const [param, setParam] = useState<Param>({
    kind: 7,
    url: "https://www.youtube.com/watch?v=-JvG2nmINg0",
  })

  // useEffect(() => {
  //   fetchConfig();
  // }, []);

  useEffect(() => {
    // Tauriイベントからffmpegの出力をリアルタイムで受け取る
    const unlistenOutput = listen<string>("ffmpeg-output", (event) => {
      // TODO: 最初の改行を削除する
      setConsoleText((prev) => prev + "\n" + event.payload)
    })

    // プロセス終了時の通知を受け取る
    const unlistenExit = listen<string>("process-exit", (event) => {
      // setConsoleText((prev) => prev + "\n" + event.payload);
      setPid(null) // プロセスIDをクリア
    })

    return () => {
      unlistenOutput.then((fn) => fn())
      unlistenExit.then((fn) => fn())
    }
  }, [])

  async function executeButtonOnClick() {
    try {
      // コマンド実行してPIDを取得
      const processId = (await invoke("run_command", { param })) as number
      setPid(processId)
      // setConsoleText(`プロセス開始。PID: ${processId}`);
    } catch (err) {
      // setConsoleText(`エラー: ${err}`);
    }
  }

  const goToSettingHandler = () => {
    navigate("/setting")
  }

  const openDirectory = async () => {
    console.log("openDirectory", saveDir)
    await invoke("open_directory", { path: saveDir });
  }

  return (
    <div className="root-home">
      <div className="main-row">
        <div className="line-1">
          <div>
            <IconButton size="small" onClick={goToSettingHandler}>
              <SettingsIcon />
            </IconButton>
          </div>
          <div className="line-children">
            <p>コーデックID</p>
            <Input
              value={param.codec_id || ""}
              onChange={(e) => setParam({ ...param, codec_id: e.target.value })}
            />
          </div>
          <div className="line-children">
            <p>字幕言語</p>
            <Input
              value={param.options || ""}
              onChange={(e) => setParam({ ...param, options: e.target.value })}
            />
          </div>
          <DropDownWithArrows />
          <div className="is-running-label-wrapper">
            {pid !== null ? (
              <div className="is-running-label">PID {pid}で実行中です</div>
            ) : (
              <div className="is-not-running-label"></div>
            )}
          </div>
          <Button
            variant="contained"
            onClick={openDirectory}
          >
            保存先を開く
          </Button>
        </div>
        <div className="line-2">
          <ExecuteButton executeButtonOnClick={executeButtonOnClick} />
          <div className="line-children">
            <span
              className="arbitrary-code-label"
            >
              任意コード
            </span>
            <Input
              sx={{
                width: "100%",
              }}
              value={arbitraryCode}
              onChange={(e) => {
                setArbitraryCode(e.target.value)
              }}
            />
          </div>
        </div>
      </div>
      <ConsoleBox consoleText={consoleText} />
    </div>
  )
}
