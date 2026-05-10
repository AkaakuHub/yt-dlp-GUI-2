use tao::{
    event::Event,
    event_loop::{ControlFlow, EventLoopBuilder},
};
use tray_icon::{
    menu::{Menu, MenuEvent, MenuId, MenuItem},
    Icon, TrayIconBuilder,
};

use super::process::SharedDownloadProcess;

enum TrayEvent {
    Menu(MenuEvent),
}

pub(super) fn run_tray(
    address: String,
    download_process: SharedDownloadProcess,
) -> Result<(), String> {
    let event_loop = EventLoopBuilder::<TrayEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event| {
        let _ = proxy.send_event(TrayEvent::Menu(event));
    }));

    let quit_id = MenuId::new("quit");
    let stop_id = MenuId::new("stop");
    let menu = Menu::new();
    let status_item = MenuItem::new("yt-dlp-GUIサーバー起動中", false, None);
    let address_item = MenuItem::new(&address, false, None);
    let stop_item = MenuItem::with_id(stop_id.clone(), "実行中のyt-dlpを停止", true, None);
    let quit_item = MenuItem::with_id(quit_id.clone(), "終了", true, None);
    menu.append(&status_item)
        .map_err(|e| format!("trayメニューの作成に失敗しました: {}", e))?;
    menu.append(&address_item)
        .map_err(|e| format!("trayメニューの作成に失敗しました: {}", e))?;
    menu.append(&stop_item)
        .map_err(|e| format!("trayメニューの作成に失敗しました: {}", e))?;
    menu.append(&quit_item)
        .map_err(|e| format!("trayメニューの作成に失敗しました: {}", e))?;

    let _tray_icon = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip(format!("yt-dlp-GUIサーバー起動中 {}", address))
        .with_title("yt-dlp-GUI")
        .with_icon(tray_icon())
        .build()
        .map_err(|e| format!("trayアイコンの作成に失敗しました: {}", e))?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::UserEvent(TrayEvent::Menu(event)) = event {
            if event.id == quit_id {
                *control_flow = ControlFlow::Exit;
                return;
            }
            if event.id == stop_id {
                let download_process = download_process.clone();
                std::thread::spawn(move || {
                    if let Ok(runtime) = tokio::runtime::Runtime::new() {
                        let _ = runtime.block_on(download_process.stop());
                    }
                });
            }
        }
    });
}

fn tray_icon() -> Icon {
    let width = 32;
    let height = 32;
    let mut rgba = vec![0; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) * 4;
            let in_mark = (8..=23).contains(&x) && (8..=23).contains(&y);
            rgba[index] = if in_mark { 36 } else { 20 };
            rgba[index + 1] = if in_mark { 137 } else { 20 };
            rgba[index + 2] = if in_mark { 240 } else { 20 };
            rgba[index + 3] = if in_mark { 255 } else { 0 };
        }
    }
    Icon::from_rgba(rgba, width as u32, height as u32).expect("invalid tray icon")
}
