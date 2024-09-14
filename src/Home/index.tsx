import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { dialog } from "@tauri-apps/api";
import "./index.css";

import ExecuteButton from "../_components/ExecuteButton";
import BottomTab from "../_components/BottomTab";

import { toast } from "react-toastify";

import CustomButton from "../_components/CustomButton";

import {
  Input,
  Switch,
} from "@mui/material";

import DropDownWithArrows from "../_components/DropDownWithArrows";

import { useAppContext } from "../_components/AppContext";

export default function Home() {
  const { setLatestConsoleText } = useAppContext();
  const { saveDir } = useAppContext();
  const [pid, setPid] = useState<number | null>(null);

  const [consoleText, setConsoleText] = useState<string>("");
  const [arbitraryCode, setArbitraryCode] = useState<string>("");

  const { selectedIndexNumber, setSelectedIndexNumber } = useAppContext();
  const selectedIndexRef = useRef(selectedIndexNumber);

  useEffect(() => {
    const checkProgram = async (programName: string) => {
      try {
        await invoke<string>("is_program_available", { programName });
      } catch (error) {
        console.error(`${programName} is not available: ${error}`);
        await dialog.message(`${programName}がインストールされていないか、パスが通っていません。表示される手順に従ってパスを通してください。`);
        await invoke("open_url_and_exit", { url: "https://github.com/AkaakuHub/yt-dlp-GUI?tab=readme-ov-file#yt-dlp%E3%81%8C%E3%82%A4%E3%83%B3%E3%82%B9%E3%83%88%E3%83%BC%E3%83%AB%E3%81%95%E3%82%8C%E3%81%A6%E3%81%84%E3%81%AA%E3%81%84%E3%81%8B%E3%83%91%E3%82%B9%E3%81%8C%E9%80%9A%E3%81%A3%E3%81%A6%E3%81%84%E3%81%BE%E3%81%9B%E3%82%93%E8%A1%A8%E7%A4%BA%E3%81%95%E3%82%8C%E3%82%8B%E6%89%8B%E9%A0%86%E3%81%AB%E5%BE%93%E3%81%A3%E3%81%A6%E3%83%91%E3%82%B9%E3%82%92%E9%80%9A%E3%81%97%E3%81%A6%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84%E3%81%A8%E8%A1%A8%E7%A4%BA%E3%81%95%E3%82%8C%E3%82%8B" });
      }
    };

    checkProgram("yt-dlp");
    checkProgram("ffmpeg");
  }, []);

  useEffect(() => {
    selectedIndexRef.current = selectedIndexNumber;
  }, [selectedIndexNumber]);

  // // debug
  // useEffect(() => {
  //   setPid(0);
  // }, [])

  useEffect(() => {
    // setLatestConsoleText("[download]  58.5% of ~ 759.19MiB at   38.95MiB/s ETA 00:16 (frag 49/173)");
    // setLatestConsoleText("[download]   29.1% of  925.79KiB at    7.32MiB/s ETA 00:02 (frag 12/12)");
    // setLatestConsoleText("[download] Destination: C:\\Users\\akaaku\\Videos\\yt-dlp-data\\hogehogehogehogehogehogehogehogehogehogehogehoge1111111111111111111");
    // setLatestConsoleText("[download]   8.1% of   83.35MiB at  Unknown B/s ETA Unknown");
    // setLatestConsoleText("[download] 100% of    4.42MiB in 00:00:00 at 6.21MiB/s         ");
    // setLatestConsoleText("[fixUpM3u8] 100% of    4.42MiB in 00:00:00 at 6.21MiB/s         ");
    // setLatestConsoleText("[FixupM3u8] Fixing MPEG-TS in MP4 container of hoge.mp4");
    // setLatestConsoleText("");
  }, [])

  interface Param {
    codec_id?: string;
    subtitle_lang?: string;
    is_cookie: boolean;
  }

  const [param, setParam] = useState<Param>({
    codec_id: undefined,
    subtitle_lang: undefined,
    is_cookie: false,
  })

  useEffect(() => {
    // Tauriイベントからffmpegの出力をリアルタイムで受け取る
    const unlistenOutput = listen<string>("process-output", (event) => {
      if (event.payload === "") {
        return;
      }
      const maxLength = 10000;
      setConsoleText((prev) => {
        // prev が空なら最初の改行を削除した新しいテキストをセット
        if (prev === "") {
          return event.payload.trimStart();
        }
        // if (prev.length > maxLength) {
        //   return prev.slice(prev.length - maxLength) + "\n" + event.payload;
        // }
        // そうでなければ改行して追加
        return prev + "\n" + event.payload;
      });
      setLatestConsoleText(event.payload);
    });

    const unlistenExit = listen<string>("process-exit", () => {
      setPid(null);
    })

    const unlistenServerOutput = listen<string>("server-output", (event) => {
      const data = event.payload;
      try {
        const dataJson = JSON.parse(data);
        const url = dataJson.url;
        executeButtonOnClick(url);
      } catch (err) {
        toast.error(`エラー: ${err}`);
      }
    });

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      unlistenServerOutput.then((fn) => fn());
    }
  }, [])

  const deleteQuery = (url: string) => {
    let pattern;
    if (url.includes("playlist")) {
      pattern = "([&?](si|index|ab_channel|pp)[^&]*)";
    } else {
      pattern = "([&?](si|list|index|ab_channel|pp|spm_id_from)[^&]*)";
    }
    url = url.replace(new RegExp(pattern, "g"), "");
    url = url.replace(new RegExp("[&?]$", "g"), "");
    return url;
  }

  async function executeButtonOnClick(url_input: string) {
    try {
      let processId;
      const currentSelectedIndex = selectedIndexRef.current;

      let url = url_input;
      if (currentSelectedIndex !== 13) {
        if (!url || url === "") {
          toast.error("URLが空です。");
          return;
        } else if (!(url.startsWith("http"))) {
          toast.error(`"${url}"は有効なURLではありません。`);
          return;
        }
        url = deleteQuery(url);
        if (url.length > 100) { url = url.slice(0, 97) + "…"; }
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
    } catch (err) {
      toast.error(`エラー: ${err}`);
    }
  }

  const stopProcessHanlder = async () => {
    await invoke("stop_command", { pid });
    setPid(null);
  }

  const openDirectory = async () => {
    await invoke("open_directory", { path: saveDir });
  }

  return (
    <div className="root-home">
      <div className="main-row">
        <div className="line-1">
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
              <div className="is-running-inner">
                <div className="is-running-label">PID {pid}で実行中です</div>
                <CustomButton
                  variant="contained"
                  onClick={() => {
                    stopProcessHanlder();
                  }}
                >
                  中止
                </CustomButton>
              </div>
            ) : (
              <div className="is-not-running-label"></div>
            )}
          </div>
          <div>
            <CustomButton
              variant="contained"
              onClick={openDirectory}
              sx={{
                width: "8rem",
              }}
            >
              保存先を開く
            </CustomButton>
            <Switch
              checked={param.is_cookie}
              onChange={(e) => setParam({ ...param, is_cookie: e.target.checked })}
            />
            クッキーを使う
          </div>
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
      <BottomTab consoleText={consoleText} />
    </div>
  )
}
