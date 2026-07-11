cmake_minimum_required(VERSION 3.13)

if(NOT DEFINED PICO_BOARD)
    set(PICO_BOARD pico_w CACHE STRING "Board type")
endif()

include(pico_sdk_import.cmake)

project(ionity_picolink C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

pico_sdk_init()

add_executable(ionity_picolink
    ${PICO_SDK_PATH}/lib/tinyusb/src/class/bth/bth_device.c
    src/main.c
    src/usb_descriptors.c
    src/hci_bridge.c
    src/wifi_scan.c
    src/btmon.c
    src/oled.c
    src/ui.c
    src/buttons.c
    src/logbuf.c
    src/control.c
    src/msc_disk.c
)

target_include_directories(ionity_picolink PRIVATE src)

target_compile_definitions(ionity_picolink PRIVATE
    CYW43_ENABLE_BLUETOOTH=1
    CYW43_LWIP=0
    PICOLINK_BOARD="${PICO_BOARD}"
)

target_link_libraries(ionity_picolink
    pico_stdlib
    pico_unique_id
    hardware_spi
    hardware_gpio
    hardware_adc
    pico_cyw43_arch_none
    tinyusb_device
    tinyusb_board
)

pico_set_program_name(ionity_picolink "IONITY PicoLink")
pico_set_program_version(ionity_picolink "1.3.0")

pico_add_extra_outputs(ionity_picolink)
