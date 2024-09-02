import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { readText } from '@tauri-apps/api/clipboard';
import { useNavigate } from "react-router-dom";
import "./index.css";

import ExecuteButton from "../_components/ExecuteButton";
import ConsoleBox from "../_components/ConsoleBox";

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import SettingsIcon from "@mui/icons-material/Settings";
import {
  IconButton,
  Input,
  Button,
} from "@mui/material";

import DropDownWithArrows from "../_components/DropDownWithArrows";

import { ConfigProps } from "../types";

export default function Home() {
  const navigate = useNavigate()

  const [consoleText, setConsoleText] = useState<string>("");
  const [pid, setPid] = useState<number | null>(null);
  const [arbitraryCode, setArbitraryCode] = useState<string>("");

  const [selectedIndexNumber, setSelectedIndexNumber] = useState<number>(3);
  const selectedIndexRef = useRef(selectedIndexNumber);

  useEffect(() => {
    selectedIndexRef.current = selectedIndexNumber;
  }, [selectedIndexNumber]);

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
    codec_id?: string
    subtitle_lang?: string
  }

  const [param, setParam] = useState<Param>({
    codec_id: undefined,
    subtitle_lang: undefined,
  })

  useEffect(() => {
    // Tauriイベントからffmpegの出力をリアルタイムで受け取る
    const unlistenOutput = listen<string>("process-output", (event) => {
      if (event.payload === "") {
        return;
      }

      setConsoleText((prev) => {
        // prev が空なら最初の改行を削除した新しいテキストをセット
        if (prev === "") {
          return event.payload.trimStart();
        }
        // そうでなければ改行して追加
        return prev + "\n" + event.payload;
      });
    });

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
      let processId;
      const currentSelectedIndex = selectedIndexRef.current;

      // クリップボード取得
      let url = await readText();
      if (currentSelectedIndex !== 13) {
        if (!url || url === "") {
          toast.error("URLが空です。");
          return;
        } else if (!(url.startsWith("http"))) {
          if (url.length > 100) { url = url.slice(0, 97) + "…"; }
          toast.error(`"${url}"は有効なURLではありません。`);
          return;
        }
        processId = (await invoke("run_command", {
          param: {
            ...param,
            url,
            kind: currentSelectedIndex,
          }
        })) as number
      } else {
        if (arbitraryCode === "") {
          toast.error("任意コードが空です。");
          return;
        }
        processId = (await invoke("run_command", {
          param: {
            arbitrary_code: arbitraryCode,
            kind: currentSelectedIndex,
          }
        })) as number
      }

      setPid(processId)
      // setConsoleText(`プロセス開始。PID: ${processId}`);
    } catch (err) {
      toast.error(`エラー: ${err}`);
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
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        draggable
        pauseOnFocusLoss={false}
        pauseOnHover
        theme="light"
        style={{
          top: "36px",
        }}
      />
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
              value={param.subtitle_lang || ""}
              onChange={(e) => setParam({ ...param, subtitle_lang: e.target.value })}
            />
          </div>
          <DropDownWithArrows
            {...{ selectedIndexNumber, setSelectedIndexNumber }}
          />
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
            sx={{
              width: "8rem",
            }}
          >
            保存先を開く
          </Button>
        </div>
        <div className="line-2">
          <ExecuteButton
            executeButtonOnClick={executeButtonOnClick}
            isRunning={pid !== null}
          />
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
