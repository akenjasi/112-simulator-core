import os

files_to_scale = [
    'app/dds/page.tsx',
    'components/dispatcher/caller-panel.tsx',
    'components/dispatcher/incident-panel.tsx',
    'components/dispatcher/dispatch-panel.tsx',
    'components/dispatcher/services-bar.tsx',
    'components/dispatcher/top-bar.tsx',
]

replacements = {
    '2xl:text-3xl': '2xl:text-2xl',
    '2xl:text-2xl': '2xl:text-xl',
    '2xl:text-xl': '2xl:text-lg',
    '2xl:text-lg': '2xl:text-base',
    '2xl:text-base': '2xl:text-sm',
    '2xl:px-7': '2xl:px-5',
    '2xl:py-4': '2xl:py-3',
    '2xl:px-6': '2xl:px-5',
    '2xl:py-3': '2xl:py-2',
    '2xl:gap-3': '2xl:gap-2',
    '2xl:gap-4': '2xl:gap-3',
    '2xl:p-3': '2xl:p-2',
    '2xl:h-[36px]': '2xl:h-[30px]',
    '2xl:w-[36px]': '2xl:w-[30px]',
    '2xl:w-[90px]': '2xl:w-[70px]',
    '2xl:w-[140px]': '2xl:w-[110px]',
    '2xl:h-8': '2xl:h-6',
    '2xl:w-8': '2xl:w-6',
    '2xl:h-7': '2xl:h-5',
    '2xl:w-7': '2xl:w-5',
}

for path in files_to_scale:
    if not os.path.exists(path):
        continue
    with open(path, 'r') as f:
        content = f.read()
        
    for k, v in replacements.items():
        content = content.replace(k, v)
        
    with open(path, 'w') as f:
        f.write(content)
print("Done")
